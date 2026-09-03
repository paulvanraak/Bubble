import AppKit

/// A slim, always-on-top, click-through-free panel that hugs one edge of the
/// screen and hosts the stack of colored note tabs. Only `Layout.stripWidth`
/// points wide, so it never covers more of the desktop than the tabs need.
final class EdgeStripWindow: NSPanel {
    init(screen: NSScreen, edge: EdgeSide) {
        let visible = screen.visibleFrame
        let width = Layout.stripWidth
        let x = edge == .right ? visible.maxX - width : visible.minX
        let rect = NSRect(x: x, y: visible.minY, width: width, height: visible.height)

        super.init(
            contentRect: rect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        isMovableByWindowBackground = false
        hidesOnDeactivate = false
        ignoresMouseEvents = false
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
