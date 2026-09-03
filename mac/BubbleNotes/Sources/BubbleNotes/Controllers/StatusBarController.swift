import AppKit

final class StatusBarController: NSObject {
    private let statusItem: NSStatusItem
    private let store: NoteStore
    private let edgeController: EdgeNotesController
    private let showArchive: () -> Void

    init(store: NoteStore, edgeController: EdgeNotesController, showArchive: @escaping () -> Void) {
        self.store = store
        self.edgeController = edgeController
        self.showArchive = showArchive
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        super.init()

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "note.text", accessibilityDescription: "Bubble Notes")
        }

        let menu = NSMenu()

        menu.addItem(withTitle: "New Note", action: #selector(newNote), keyEquivalent: "n").target = self
        menu.addItem(NSMenuItem.separator())

        let leftItem = NSMenuItem(title: "Left Edge", action: #selector(setLeft), keyEquivalent: "")
        leftItem.target = self
        menu.addItem(leftItem)

        let rightItem = NSMenuItem(title: "Right Edge", action: #selector(setRight), keyEquivalent: "")
        rightItem.target = self
        menu.addItem(rightItem)

        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "Archive\u{2026}", action: #selector(openArchive), keyEquivalent: "a").target = self
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "Quit Bubble Notes", action: #selector(quit), keyEquivalent: "q").target = self

        statusItem.menu = menu
    }

    @objc private func newNote() {
        edgeController.createAndPinNewNote()
    }

    @objc private func setLeft() {
        edgeController.setEdge(.left)
    }

    @objc private func setRight() {
        edgeController.setEdge(.right)
    }

    @objc private func openArchive() {
        showArchive()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
