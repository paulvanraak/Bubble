import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    let store = NoteStore()
    lazy var edgeController = EdgeNotesController(store: store)
    private var statusBarController: StatusBarController?
    private var archiveWindowController: ArchiveWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        edgeController.start()
        statusBarController = StatusBarController(
            store: store,
            edgeController: edgeController,
            showArchive: { [weak self] in self?.showArchive() }
        )
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    private func showArchive() {
        if archiveWindowController == nil {
            archiveWindowController = ArchiveWindowController(store: store)
        }
        archiveWindowController?.show()
    }
}
