import AppKit

/// The floating sticky-note card that slides out next to the edge strip.
final class NoteCardWindow: NSPanel {
    init() {
        let rect = NSRect(x: 0, y: 0, width: Layout.cardWidth, height: Layout.cardHeight)

        super.init(
            contentRect: rect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        isMovableByWindowBackground = false
        hidesOnDeactivate = false
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
