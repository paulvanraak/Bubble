import AppKit
import SwiftUI

final class ArchiveWindowController: NSWindowController {
    convenience init(store: NoteStore) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 480),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Archive"
        window.center()
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: ArchiveView().environmentObject(store))
        self.init(window: window)
    }

    func show() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
