import Foundation

enum EdgeSide: String, CaseIterable, Identifiable, Hashable {
    case left, right

    var id: String { rawValue }

    var label: String {
        switch self {
        case .left: return "Left edge"
        case .right: return "Right edge"
        }
    }
}
