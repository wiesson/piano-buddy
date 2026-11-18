import Capacitor
import CoreAudioKit
import CoreMIDI
import os
import UIKit

private let log = Logger(subsystem: "me.wiese.pianobuddy", category: "midi")

/// Lädt das eigene Plugin in die Capacitor-Brücke (Main.storyboard zeigt auf diese Klasse).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PianoMidiPlugin())
    }
}

/// MIDI vom Klavier für die Web-App: CoreMIDI-Quellen (USB und gekoppeltes Bluetooth-MIDI)
/// verbinden und Anschläge als Ereignis `noteOn` an JavaScript melden. Safari hat kein Web MIDI,
/// deshalb gibt es diese Hülle.
@objc(PianoMidiPlugin)
public class PianoMidiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PianoMidiPlugin"
    public let jsName = "PianoMidi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showBluetooth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
    ]

    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var started = false
    private var connected = Set<MIDIUniqueID>()

    /// Alles mit CoreMIDI läuft auf dem Main-Thread: Capacitor ruft Plugin-Methoden auf einer
    /// Hintergrund-Queue ohne Runloop auf, CoreMIDI liefert Benachrichtigungen (Gerät gekoppelt,
    /// abgezogen) aber auf dem Runloop des Threads, der den Client erstellt hat. Auf der Queue
    /// kamen sie nie an: Ein Klavier, das erst nach dem Einschalten verbunden wurde, blieb unsichtbar.
    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return call.reject("Plugin weg") }
            if !self.started {
                var status = MIDIClientCreateWithBlock("PianoBuddy" as CFString, &self.client) { [weak self] note in
                    let id = note.pointee.messageID
                    log.debug("Benachrichtigung \(id.rawValue)")
                    switch id {
                    case .msgSetupChanged, .msgObjectAdded, .msgObjectRemoved:
                        DispatchQueue.main.async { self?.refresh() }
                    default: break
                    }
                }
                guard status == noErr else {
                    log.error("MIDIClientCreate: \(status)")
                    return call.reject("MIDI-Client: \(status)")
                }
                status = MIDIInputPortCreateWithBlock(self.client, "Eingang" as CFString, &self.port) { [weak self] list, _ in
                    self?.handle(list)
                }
                guard status == noErr else {
                    log.error("MIDIInputPortCreate: \(status)")
                    return call.reject("MIDI-Eingang: \(status)")
                }
                self.started = true
            }
            self.connectAll()
            let devices = self.deviceNames()
            log.info("start: \(devices.count) Quelle(n): \(devices.joined(separator: ", "))")
            call.resolve(["devices": devices])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return call.resolve() }
            for i in 0..<MIDIGetNumberOfSources() {
                MIDIPortDisconnectSource(self.port, MIDIGetSource(i))
            }
            self.connected.removeAll()
            log.info("stop")
            call.resolve()
        }
    }

    /// Display beim Üben anlassen (Leerlauf-Timer aus); der Wake Lock der WebView greift nicht verlässlich
    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }

    /// Apples eigener Dialog zum Koppeln von Bluetooth-MIDI-Geräten (das CA701 meldet sich dort).
    @objc func showBluetooth(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.bridge?.viewController else { return call.reject("Keine Ansicht") }
            let central = CABTMIDICentralViewController()
            let nav = UINavigationController(rootViewController: central)
            central.navigationItem.rightBarButtonItem = UIBarButtonItem(
                systemItem: .done,
                primaryAction: UIAction { [weak self] _ in
                    presenter.dismiss(animated: true) { self?.refresh() }
                }
            )
            // Wegwischen ohne „Fertig“ soll auch neu suchen
            self?.sheetDelegate.onDismiss = { [weak self] in self?.refresh() }
            nav.presentationController?.delegate = self?.sheetDelegate
            log.info("Bluetooth-Dialog geöffnet")
            presenter.present(nav, animated: true)
            call.resolve()
        }
    }

    private let sheetDelegate = SheetDelegate()

    /// Quellen neu verbinden und JavaScript die aktuelle Liste melden
    private func refresh() {
        connectAll()
        let devices = deviceNames()
        log.info("Quellen: \(devices.count) (\(devices.joined(separator: ", ")))")
        emitDevices()
    }

    private func connectAll() {
        guard started else { return }
        // Getrennte Geräte vergessen, damit sie beim Wiederverbinden neu angebunden werden
        let present = Set((0..<MIDIGetNumberOfSources()).map { i -> MIDIUniqueID in
            var uid: MIDIUniqueID = 0
            MIDIObjectGetIntegerProperty(MIDIGetSource(i), kMIDIPropertyUniqueID, &uid)
            return uid
        })
        connected.formIntersection(present)
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i)
            var uid: MIDIUniqueID = 0
            MIDIObjectGetIntegerProperty(src, kMIDIPropertyUniqueID, &uid)
            if connected.contains(uid) { continue }
            let status = MIDIPortConnectSource(port, src, nil)
            if status == noErr { connected.insert(uid) } else { log.error("Verbinden fehlgeschlagen: \(status)") }
        }
    }

    private func deviceNames() -> [String] {
        (0..<MIDIGetNumberOfSources()).compactMap { i in
            var name: Unmanaged<CFString>?
            guard MIDIObjectGetStringProperty(MIDIGetSource(i), kMIDIPropertyDisplayName, &name) == noErr,
                  let n = name?.takeRetainedValue() else { return nil }
            return n as String
        }
    }

    private func emitDevices() {
        notifyListeners("devices", data: ["devices": deviceNames()])
    }

    /// Note-On und Note-Off aus den MIDI-1.0-Paketen lesen, mit dem Zeitstempel des Pakets.
    /// CoreMIDI stempelt in Host-Ticks (bei Bluetooth-MIDI aus den Zeitstempeln des Geräts
    /// rekonstruiert). Mit gemeldet wird die Host-Zeit beim Absenden: JavaScript rechnet daraus
    /// auf performance.now() um, sodass die Laufzeit über die Capacitor-Brücke nicht zählt.
    private func handle(_ list: UnsafePointer<MIDIPacketList>) {
        // (Ton, Stärke, Zeit in ms); Stärke 0 heißt losgelassen
        var notes: [(UInt8, UInt8, Double)] = []
        for packet in list.unsafeSequence() {
            let bytes = Array(packet.bytes())
            // Zeitstempel 0 heißt „jetzt“
            let stamp = packet.pointee.timeStamp
            let tMs = stamp == 0 ? PianoMidiPlugin.hostMs(mach_absolute_time()) : PianoMidiPlugin.hostMs(stamp)
            var i = 0
            while i < bytes.count {
                let status = bytes[i]
                if (status & 0xF0 == 0x90 || status & 0xF0 == 0x80), i + 2 < bytes.count {
                    // Note-On mit Stärke 0 oder Note-Off: losgelassen
                    let velocity = status & 0xF0 == 0x80 ? 0 : bytes[i + 2]
                    notes.append((bytes[i + 1], velocity, tMs))
                    i += 3
                } else if status & 0x80 != 0 {
                    // andere Statusmeldungen: Datenbytes überspringen
                    let kind = status & 0xF0
                    i += (kind == 0xC0 || kind == 0xD0) ? 2 : (status >= 0xF0 ? 1 : 3)
                } else {
                    i += 1
                }
            }
        }
        guard !notes.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            let sent = PianoMidiPlugin.hostMs(mach_absolute_time())
            for (note, velocity, tMs) in notes {
                if velocity == 0 {
                    self?.notifyListeners("noteOff", data: ["note": Int(note), "t": tMs, "sent": sent])
                } else {
                    self?.notifyListeners("noteOn", data: ["note": Int(note), "velocity": Int(velocity), "t": tMs, "sent": sent])
                }
            }
        }
    }

    private static let timebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    /// Host-Ticks in Millisekunden
    static func hostMs(_ ticks: UInt64) -> Double {
        Double(ticks) * Double(timebase.numer) / Double(timebase.denom) / 1_000_000
    }
}

/// Meldet, wenn der Bluetooth-Dialog weggewischt wurde
private final class SheetDelegate: NSObject, UIAdaptivePresentationControllerDelegate {
    var onDismiss: (() -> Void)?
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        onDismiss?()
    }
}
