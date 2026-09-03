import SwiftUI

struct ArchiveView: View {
    @EnvironmentObject var store: NoteStore

    var body: some View {
        VStack(spacing: 0) {
            if store.archivedNotes.isEmpty {
                Spacer()
                Text("No archived notes yet")
                    .foregroundColor(.secondary)
                Spacer()
            } else {
                List {
                    ForEach(store.archivedNotes) { note in
                        HStack {
                            Circle().fill(note.color.fill).frame(width: 10, height: 10)
                            VStack(alignment: .leading) {
                                Text(note.title.isEmpty ? "Untitled" : note.title)
                                    .font(.system(size: 12, weight: .medium))
                                Text(note.body)
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Button("Restore") { restore(note) }
                                .buttonStyle(.bordered)
                                .controlSize(.mini)
                            Button("Export") { ExportManager.exportSingle(note) }
                                .buttonStyle(.bordered)
                                .controlSize(.mini)
                            Button(role: .destructive, action: { store.delete(id: note.id) }) {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.mini)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            Divider()
            HStack {
                Spacer()
                Button("Export All\u{2026}") { ExportManager.exportAll(store.notes) }
                    .buttonStyle(.bordered)
            }
            .padding(10)
        }
        .frame(minWidth: 380, minHeight: 360)
    }

    private func restore(_ note: Note) {
        var updated = note
        updated.isArchived = false
        updated.isCompleted = false
        let nextIndex = (store.notes.map { $0.sortIndex }.max() ?? -1) + 1
        updated.sortIndex = nextIndex
        store.update(updated)
    }
}
