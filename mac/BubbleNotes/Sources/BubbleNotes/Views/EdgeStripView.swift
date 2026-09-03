import SwiftUI

struct EdgeStripView: View {
    @ObservedObject var controller: EdgeNotesController
    @EnvironmentObject var store: NoteStore

    @State private var draggingID: UUID?
    @State private var dragTranslation: CGFloat = 0
    @State private var liveOrder: [Note] = []

    var body: some View {
        let notes = liveOrder.isEmpty ? store.activeNotes : liveOrder

        ZStack(alignment: .top) {
            Color.clear
            VStack(spacing: Layout.tabSpacing) {
                ForEach(Array(notes.enumerated()), id: \.element.id) { index, note in
                    TabHandle(note: note, isPinned: controller.pinnedNoteID == note.id)
                        .frame(width: Layout.stripWidth, height: Layout.tabHeight)
                        .offset(y: draggingID == note.id ? dragTranslation : 0)
                        .zIndex(draggingID == note.id ? 1 : 0)
                        .onHover { hovering in
                            if hovering {
                                controller.requestShow(noteID: note.id, index: index)
                            } else {
                                controller.requestHide(noteID: note.id)
                            }
                        }
                        .onTapGesture {
                            controller.togglePin(noteID: note.id, index: index)
                        }
                        .gesture(
                            DragGesture(minimumDistance: 4)
                                .onChanged { value in
                                    draggingID = note.id
                                    dragTranslation = value.translation.height
                                    reorderLive(draggingID: note.id, translation: value.translation.height)
                                }
                                .onEnded { _ in
                                    draggingID = nil
                                    dragTranslation = 0
                                    if !liveOrder.isEmpty {
                                        controller.store.reorder(activeIDsInOrder: liveOrder.map { $0.id })
                                    }
                                    liveOrder = []
                                }
                        )
                }
            }
            .padding(.top, Layout.topPadding)
        }
        .frame(width: Layout.stripWidth)
    }

    private func reorderLive(draggingID: UUID, translation: CGFloat) {
        var order = liveOrder.isEmpty ? store.activeNotes : liveOrder
        guard let fromIndex = order.firstIndex(where: { $0.id == draggingID }) else { return }
        let step = Layout.tabHeight + Layout.tabSpacing
        let shift = Int((translation / step).rounded())
        let targetIndex = min(max(fromIndex + shift, 0), order.count - 1)
        if targetIndex != fromIndex {
            let item = order.remove(at: fromIndex)
            order.insert(item, at: targetIndex)
        }
        liveOrder = order
    }
}

private struct TabHandle: View {
    let note: Note
    let isPinned: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(note.color.fill)
            .overlay(
                Text(labelText)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1)
                    .foregroundColor(.black.opacity(0.65))
                    .fixedSize()
                    .rotationEffect(.degrees(-90))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.black.opacity(isPinned ? 0.45 : 0.08), lineWidth: isPinned ? 1.5 : 1)
            )
            .shadow(color: .black.opacity(0.25), radius: 3, x: -1, y: 1)
    }

    private var labelText: String {
        let trimmed = note.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = trimmed.isEmpty ? "NOTE" : trimmed.uppercased()
        return String(text.prefix(10))
    }
}
