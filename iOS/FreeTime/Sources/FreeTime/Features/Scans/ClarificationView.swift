import SwiftUI

/// A view that presents a single clarification question to help improve scan accuracy
struct ClarificationView: View {
    let clarification: ClarificationRequest
    let onAnswer: (String) -> Void
    let onSkip: () -> Void
    
    @State private var selectedOption: String?
    
    var body: some View {
        VStack(spacing: 24) {
            // Header
            VStack(spacing: 8) {
                Image(systemName: "questionmark.circle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(Color(hex: "6366f1"))
                
                Text("Quick Question")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)
                
                Text("Help us identify this item more accurately")
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "8888a0"))
            }
            .padding(.top, 20)
            
            // Question
            Text(clarification.question)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            // Options
            VStack(spacing: 12) {
                ForEach(clarification.options) { option in
                    Button {
                        withAnimation(.spring(response: 0.3)) {
                            selectedOption = option.value
                        }
                        // Auto-submit after short delay
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            onAnswer(option.value)
                        }
                    } label: {
                        HStack {
                            // Radio button
                            ZStack {
                                Circle()
                                    .stroke(
                                        selectedOption == option.value 
                                            ? Color(hex: "6366f1") 
                                            : Color(hex: "3a3a44"),
                                        lineWidth: 2
                                    )
                                    .frame(width: 24, height: 24)
                                
                                if selectedOption == option.value {
                                    Circle()
                                        .fill(Color(hex: "6366f1"))
                                        .frame(width: 14, height: 14)
                                }
                            }
                            
                            Text(option.label)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.white)
                            
                            Spacer()
                        }
                        .padding(16)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(hex: selectedOption == option.value ? "1f1f2a" : "12121a"))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(
                                            selectedOption == option.value 
                                                ? Color(hex: "6366f1") 
                                                : Color.clear,
                                            lineWidth: 2
                                        )
                                )
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            
            Spacer()
            
            // Skip button
            Button {
                onSkip()
            } label: {
                Text("Not sure • Skip")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "8888a0"))
                    .padding(.vertical, 12)
            }
            .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(hex: "0a0a0f"))
    }
}

// MARK: - Compact version for inline display

struct CompactClarificationCard: View {
    let clarification: ClarificationRequest
    let onAnswer: (String) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "questionmark.circle.fill")
                    .foregroundColor(Color(hex: "f59e0b"))
                
                Text(clarification.question)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
            }
            
            // Compact option pills
            FlowLayout(spacing: 8) {
                ForEach(clarification.options) { option in
                    Button {
                        onAnswer(option.value)
                    } label: {
                        Text(option.label)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color(hex: "1a1a24"))
                            .cornerRadius(16)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(Color(hex: "3a3a44"), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color(hex: "f59e0b").opacity(0.3), lineWidth: 1)
        )
    }
}

// Simple flow layout for wrapping pills
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x, 
                                       y: bounds.minY + result.positions[index].y), 
                          proposal: .unspecified)
        }
    }
    
    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        var positions: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var maxWidth: CGFloat = 0
        
        let containerWidth = proposal.width ?? .infinity
        
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            
            if currentX + size.width > containerWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            
            positions.append(CGPoint(x: currentX, y: currentY))
            lineHeight = max(lineHeight, size.height)
            currentX += size.width + spacing
            maxWidth = max(maxWidth, currentX)
        }
        
        return (CGSize(width: maxWidth, height: currentY + lineHeight), positions)
    }
}

#Preview {
    ClarificationView(
        clarification: ClarificationRequest(
            field: "category",
            question: "What type of bag is this?",
            options: [
                ClarificationOption(value: "tote_bag", label: "Tote Bag"),
                ClarificationOption(value: "messenger_bag", label: "Messenger Bag"),
                ClarificationOption(value: "backpack", label: "Backpack"),
                ClarificationOption(value: "duffel", label: "Duffel Bag"),
            ],
            reason: "Cannot determine bag type from image"
        ),
        onAnswer: { print("Selected: \($0)") },
        onSkip: { print("Skipped") }
    )
}

