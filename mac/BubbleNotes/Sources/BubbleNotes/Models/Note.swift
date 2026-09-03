import Foundation
import SwiftUI

struct Note: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var body: String
    var color: NoteColor
    var isFavorite: Bool
    var isCompleted: Bool
    var isArchived: Bool
    var sortIndex: Int
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String = "",
        body: String = "",
        color: NoteColor = .yellow,
        isFavorite: Bool = false,
        isCompleted: Bool = false,
        isArchived: Bool = false,
        sortIndex: Int = 0,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.body = body
        self.color = color
        self.isFavorite = isFavorite
        self.isCompleted = isCompleted
        self.isArchived = isArchived
        self.sortIndex = sortIndex
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

enum NoteColor: String, Codable, CaseIterable, Identifiable, Equatable {
    case yellow, orange, blue, purple, green

    var id: String { rawValue }

    /// Sticky-note paper color.
    var fill: Color {
        switch self {
        case .yellow: return Color(red: 0.98, green: 0.90, blue: 0.58)
        case .orange: return Color(red: 0.98, green: 0.72, blue: 0.52)
        case .blue: return Color(red: 0.70, green: 0.81, blue: 0.98)
        case .purple: return Color(red: 0.82, green: 0.74, blue: 0.97)
        case .green: return Color(red: 0.72, green: 0.88, blue: 0.77)
        }
    }
}
