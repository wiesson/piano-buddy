import Capacitor
import CoreAudioKit
import CoreMIDI
import UIKit

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
    ]

    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var started = false
    private var connected = Set<MIDIUniqueID>()

    @objc func start(_ call: CAPPluginCall) {
        if !started {
            var status = MIDIClientCreateWithBlock("PianoBuddy" as CFString, &client) { [weak self] note in
                switch note.pointee.messageID {
                case .msgSetupChanged, .msgObjectAdded, .msgObjectRemoved:
                    DispatchQueue.main.async {
                        self?.connectAll()
                        self?.emitDevices()
                    }
                default: break
                }
            }
            guard status == noErr else { return call.reject("MIDI-Client: \(status)") }
            status = MIDIInputPortCreateWithBlock(client, "Eingang" as CFString, &port) { [weak self] list, _ in
                self?.handle(list)
            }
            guard status == noErr else { return call.reject("MIDI-Eingang: \(status)") }
            started = true
        }
        connectAll()
        call.resolve(["devices": deviceNames()])
    }

    @objc func stop(_ call: CAPPluginCall) {
        for i in 0..<MIDIGetNumberOfSources() {
            MIDIPortDisconnectSource(port, MIDIGetSource(i))
        }
        connected.removeAll()
        call.resolve()
    }

    /// Apples eigener Dialog zum Koppeln von Bluetooth-MIDI-Geräten (das CA701 meldet sich dort).
    @objc func showBluetooth(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.bridge?.viewController else { return call.reject("Keine Ansicht") }
            let central = CABTMIDICentralViewController()
            let nav = UINavigationController(rootViewController: central)
            central.navigationItem.rightBarButtonItem = UIBarButtonItem(
                systemItem: .done,
                primaryAction: UIAction { _ in presenter.dismiss(animated: true) }
            )
            presenter.present(nav, animated: true)
            call.resolve()
        }
    }

    private func connectAll() {
        guard started else { return }
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i)
            var uid: MIDIUniqueID = 0
            MIDIObjectGetIntegerProperty(src, kMIDIPropertyUniqueID, &uid)
            if connected.contains(uid) { continue }
            if MIDIPortConnectSource(port, src, nil) == noErr { connected.insert(uid) }
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

    /// Note-On (Status 0x9n mit Anschlagstärke > 0) aus den MIDI-1.0-Paketen lesen.
    private func handle(_ list: UnsafePointer<MIDIPacketList>) {
        var notes: [(UInt8, UInt8)] = []
        for packet in list.unsafeSequence() {
            let bytes = Array(packet.bytes())
            var i = 0
            while i < bytes.count {
                let status = bytes[i]
                if status & 0xF0 == 0x90, i + 2 < bytes.count {
                    if bytes[i + 2] > 0 { notes.append((bytes[i + 1], bytes[i + 2])) }
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
            for (note, velocity) in notes {
                self?.notifyListeners("noteOn", data: ["note": Int(note), "velocity": Int(velocity)])
            }
        }
    }
}
