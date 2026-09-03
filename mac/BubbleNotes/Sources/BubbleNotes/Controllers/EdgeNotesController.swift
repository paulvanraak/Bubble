import AppKit
import SwiftUI
import Combine

/// Owns the edge strip window plus one floating card window per open note.
/// Hovering a tab previews its note; clicking a tab pins it open until the
/// user clicks Close (or clicks the tab again).
@MainActor
final class EdgeNotesController: NSObject, ObservableObject {
    let store: NoteStore

    @Published var edge: EdgeSide {
        didSet { rebuildStrip() }
    }
    @Published private(set) var pinnedNoteID: UUID?

    private var stripWindow: EdgeStripWindow!
    private var cardWindows: [UUID: NoteCardWindow] = [:]
    private var hideWorkItem: DispatchWorkItem?
    private var cancellable: AnyCancellable?

    init(store: NoteStore) {
        self.store = store
        self.edge = EdgeSide(rawValue: UserDefaults.standard.string(forKey: "edgeSide") ?? "") ?? .right
        super.init()
    }

    func start() {
        buildStrip()
        cancellable = store.$notes.sink { [weak self] _ in
            self?.refreshOpenCards()
        }
    }

    func setEdge(_ newEdge: EdgeSide) {
        UserDefaults.standard.set(newEdge.rawValue, forKey: "edgeSide")
        edge = newEdge
    }

    func createAndPinNewNote() {
        let note = store.addNote()
        guard let index = store.activeNotes.firstIndex(where: { $0.id == note.id }) else { return }
        togglePin(noteID: note.id, index: index)
    }

    // MARK: Layout

    func tabFrame(atIndex index: Int) -> NSRect {
        guard let strip = stripWindow else { return .zero }
        let topY = strip.frame.maxY - Layout.topPadding - CGFloat(index) * (Layout.tabHeight + Layout.tabSpacing)
        let originY = topY - Layout.tabHeight
        return NSRect(x: strip.frame.minX, y: originY, width: Layout.stripWidth, height: Layout.tabHeight)
    }

    // MARK: Hover / pin lifecycle

    func requestShow(noteID: UUID, index: Int) {
        hideWorkItem?.cancel()
        presentCard(noteID: noteID, index: index)
    }

    func requestHide(noteID: UUID) {
        guard pinnedNoteID != noteID else { return }
        let item = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if self.pinnedNoteID != noteID {
                self.dismissCard(noteID: noteID)
            }
        }
        hideWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: item)
    }

    func cancelPendingHide() {
        hideWorkItem?.cancel()
    }

    func togglePin(noteID: UUID, index: Int) {
        if pinnedNoteID == noteID {
            pinnedNoteID = nil
            dismissCard(noteID: noteID)
        } else {
            if let old = pinnedNoteID {
                dismissCard(noteID: old)
            }
            pinnedNoteID = noteID
            presentCard(noteID: noteID, index: index)
        }
    }

    func closeCard(noteID: UUID) {
        if pinnedNoteID == noteID { pinnedNoteID = nil }
        dismissCard(noteID: noteID)
    }

    // MARK: Window management

    private func buildStrip() {
        guard let screen = NSScreen.main else { return }
        let view = EdgeStripView(controller: self).environmentObject(store)
        let hosting = NSHostingView(rootView: view)
        let window = EdgeStripWindow(screen: screen, edge: edge)
        window.contentView = hosting
        window.orderFrontRegardless()
        stripWindow = window
    }

    private func rebuildStrip() {
        closeAllCards()
        stripWindow?.orderOut(nil)
        buildStrip()
    }

    private func presentCard(noteID: UUID, index: Int) {
        guard store.note(id: noteID) != nil, let strip = stripWindow else { return }
        let window = cardWindows[noteID] ?? makeCardWindow(for: noteID)
        cardWindows[noteID] = window

        let tab = tabFrame(atIndex: index)
        let x = edge == .right
            ? strip.frame.minX - Layout.cardGap - Layout.cardWidth
            : strip.frame.maxX + Layout.cardGap

        let visible = (strip.screen ?? NSScreen.main ?? NSScreen.screens[0]).visibleFrame
        var y = tab.midY - Layout.cardHeight / 2
        y = min(max(y, visible.minY + 8), visible.maxY - Layout.cardHeight - 8)

        let finalFrame = NSRect(x: x, y: y, width: Layout.cardWidth, height: Layout.cardHeight)

        if window.isVisible {
            window.setFrame(finalFrame, display: true, animate: false)
        } else {
            let startX = edge == .right ? x + 24 : x - 24
            window.setFrame(NSRect(x: startX, y: y, width: Layout.cardWidth, height: Layout.cardHeight), display: true)
            window.alphaValue = 0
            window.orderFrontRegardless()
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.16
                ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
                window.animator().setFrame(finalFrame, display: true)
                window.animator().alphaValue = 1
            }
        }
    }

    private func dismissCard(noteID: UUID) {
        guard let window = cardWindows[noteID] else { return }
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.14
            window.animator().alphaValue = 0
        } completionHandler: { [weak self] in
            window.orderOut(nil)
            self?.cardWindows.removeValue(forKey: noteID)
        }
    }

    private func closeAllCards() {
        for window in cardWindows.values {
            window.orderOut(nil)
        }
        cardWindows.removeAll()
        pinnedNoteID = nil
    }

    private func makeCardWindow(for noteID: UUID) -> NoteCardWindow {
        let window = NoteCardWindow()
        let view = NoteCardView(noteID: noteID, controller: self).environmentObject(store)
        window.contentView = NSHostingView(rootView: view)
        return window
    }

    private func refreshOpenCards() {
        for id in cardWindows.keys where store.note(id: id) == nil {
            dismissCard(noteID: id)
        }
    }
}
