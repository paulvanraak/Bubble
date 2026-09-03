import Foundation
import Combine

@MainActor
final class NoteStore: ObservableObject {
    @Published private(set) var notes: [Note] = []

    private let fileURL: URL

    init() {
        let dir = Persistence.appSupportDirectory()
        self.fileURL = dir.appendingPathComponent("notes.json")
        let loaded = Persistence.load(from: fileURL)
        if loaded.isEmpty {
            self.notes = [
                Note(
                    title: "Welcome",
                    body: "Hover a tab on the screen edge to preview a note.\nClick a tab to pin it open.\nDrag tabs to reorder them.\nUse \u{2018}Mark complete\u{2019} to archive a note.",
                    color: .yellow,
                    sortIndex: 0
                )
            ]
            save()
        } else {
            self.notes = loaded
        }
    }

    var activeNotes: [Note] {
        notes.filter { !$0.isArchived }.sorted { $0.sortIndex < $1.sortIndex }
    }

    var archivedNotes: [Note] {
        notes.filter { $0.isArchived }.sorted { $0.updatedAt > $1.updatedAt }
    }

    func note(id: UUID) -> Note? {
        notes.first { $0.id == id }
    }

    @discardableResult
    func addNote(color: NoteColor = .yellow) -> Note {
        let nextIndex = (notes.map { $0.sortIndex }.max() ?? -1) + 1
        let note = Note(color: color, sortIndex: nextIndex)
        notes.append(note)
        save()
        return note
    }

    func update(_ note: Note) {
        guard let idx = notes.firstIndex(where: { $0.id == note.id }) else { return }
        var updated = note
        updated.updatedAt = Date()
        notes[idx] = updated
        save()
    }

    func delete(id: UUID) {
        notes.removeAll { $0.id == id }
        save()
    }

    func setArchived(id: UUID, archived: Bool) {
        guard let idx = notes.firstIndex(where: { $0.id == id }) else { return }
        notes[idx].isArchived = archived
        notes[idx].isCompleted = archived
        notes[idx].updatedAt = Date()
        save()
    }

    func reorder(activeIDsInOrder: [UUID]) {
        for (index, id) in activeIDsInOrder.enumerated() {
            if let idx = notes.firstIndex(where: { $0.id == id }) {
                notes[idx].sortIndex = index
            }
        }
        save()
    }

    private func save() {
        Persistence.save(notes, to: fileURL)
    }
}
