import Foundation
import CoreGraphics

/// Shared geometry constants. The AppKit window-positioning code in
/// `EdgeNotesController` and the SwiftUI tab layout in `EdgeStripView` both
/// read from here so the two always agree on where each tab actually is.
enum Layout {
    static let stripWidth: CGFloat = 34
    static let tabHeight: CGFloat = 64
    static let tabSpacing: CGFloat = 10
    static let topPadding: CGFloat = 44

    static let cardWidth: CGFloat = 320
    static let cardHeight: CGFloat = 380
    static let cardGap: CGFloat = 8
}
