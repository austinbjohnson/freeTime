import SwiftUI

struct ScanListView: View {
    @EnvironmentObject var convexService: ConvexService
    @State private var selectedScan: Scan?
    @State private var scanToDelete: Scan?
    @State private var showDeleteConfirmation = false
    @State private var isEditMode = false
    @State private var selectedForDeletion: Set<String> = []
    @State private var showBatchDeleteConfirmation = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0a0a0f")
                    .ignoresSafeArea()
                
                if convexService.scans.isEmpty && !convexService.isLoading {
                    emptyStateView
                } else {
                    scansList
                }
            }
            .navigationTitle("Scans")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(Color(hex: "0a0a0f"), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if !convexService.scans.isEmpty {
                        Button(isEditMode ? "Done" : "Edit") {
                            withAnimation {
                                isEditMode.toggle()
                                if !isEditMode {
                                    selectedForDeletion.removeAll()
                                }
                            }
                        }
                        .foregroundColor(Color(hex: "6366f1"))
                    }
                }
            }
            .refreshable {
                try? await convexService.fetchUserScans()
            }
            .sheet(item: $selectedScan) { scan in
                ScanDetailView(scan: scan)
            }
            .alert("Delete Scan?", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {
                    scanToDelete = nil
                }
                Button("Delete", role: .destructive) {
                    if let scan = scanToDelete {
                        deleteScan(scan)
                    }
                }
            } message: {
                Text("This will permanently delete this scan and its images. This cannot be undone.")
            }
            .alert("Delete \(selectedForDeletion.count) Scans?", isPresented: $showBatchDeleteConfirmation) {
                Button("Cancel", role: .cancel) { }
                Button("Delete All", role: .destructive) {
                    deleteSelectedScans()
                }
            } message: {
                Text("This will permanently delete \(selectedForDeletion.count) scans and their images. This cannot be undone.")
            }
        }
        .task {
            try? await convexService.fetchUserScans()
        }
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "tag.slash")
                .font(.system(size: 60))
                .foregroundColor(Color(hex: "8888a0"))
            
            Text("No Scans Yet")
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(.white)
            
            Text("Take a photo of a clothing tag\nto get started")
                .font(.system(size: 16))
                .foregroundColor(Color(hex: "8888a0"))
                .multilineTextAlignment(.center)
        }
    }
    
    private var scansList: some View {
        VStack(spacing: 0) {
            // Batch delete button when in edit mode
            if isEditMode && !selectedForDeletion.isEmpty {
                Button {
                    showBatchDeleteConfirmation = true
                } label: {
                    HStack {
                        Image(systemName: "trash")
                        Text("Delete \(selectedForDeletion.count) Selected")
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color(hex: "ef4444"))
                    .cornerRadius(12)
                }
                .padding(.horizontal)
                .padding(.top, 8)
            }
            
            List {
                ForEach(convexService.scans) { scan in
                    HStack(spacing: 12) {
                        // Selection checkbox in edit mode
                        if isEditMode {
                            Button {
                                toggleSelection(scan)
                            } label: {
                                Image(systemName: selectedForDeletion.contains(scan.id) ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 24))
                                    .foregroundColor(selectedForDeletion.contains(scan.id) ? Color(hex: "6366f1") : Color(hex: "8888a0"))
                            }
                            .buttonStyle(.plain)
                        }
                        
                        ScanCardView(scan: scan)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if isEditMode {
                                    toggleSelection(scan)
                                } else {
                                    selectedScan = scan
                                }
                            }
                    }
                    .listRowBackground(Color(hex: "0a0a0f"))
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            scanToDelete = scan
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color(hex: "0a0a0f"))
        }
    }
    
    // MARK: - Actions
    
    private func toggleSelection(_ scan: Scan) {
        if selectedForDeletion.contains(scan.id) {
            selectedForDeletion.remove(scan.id)
        } else {
            selectedForDeletion.insert(scan.id)
        }
    }
    
    private func deleteScan(_ scan: Scan) {
        Task {
            do {
                try await convexService.deleteScan(scanId: scan.id)
                scanToDelete = nil
            } catch {
                print("[Scans] Error deleting scan: \(error)")
            }
        }
    }
    
    private func deleteSelectedScans() {
        Task {
            for scanId in selectedForDeletion {
                do {
                    try await convexService.deleteScan(scanId: scanId)
                } catch {
                    print("[Scans] Error deleting scan \(scanId): \(error)")
                }
            }
            selectedForDeletion.removeAll()
            isEditMode = false
        }
    }
}

// MARK: - Scan Card

struct ScanCardView: View {
    let scan: Scan
    
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                // Thumbnail
                AsyncImage(url: URL(string: scan.thumbnailUrl ?? scan.imageUrl ?? "")) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Rectangle()
                        .fill(Color(hex: "1a1a24"))
                        .overlay {
                            Image(systemName: "photo")
                                .foregroundColor(Color(hex: "8888a0"))
                        }
                }
                .frame(width: 80, height: 80)
                .cornerRadius(12)
                
                // Content
                VStack(alignment: .leading, spacing: 8) {
                    // Brand and status
                    HStack {
                        Text(scan.extractedData?.brand ?? (scan.status.isProcessing ? "Processing..." : "Unknown Brand"))
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                        
                        Spacer()
                        
                        StatusBadge(status: scan.status)
                    }
                    
                    // Style number or processing stage or clarification
                    if scan.status.needsClarification {
                        HStack(spacing: 6) {
                            Image(systemName: "questionmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundColor(Color(hex: "f59e0b"))
                            Text("Tap to answer question")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color(hex: "f59e0b"))
                        }
                    } else if scan.status.isProcessing {
                        CompactProgressBar(status: scan.status)
                    } else if let styleNumber = scan.extractedData?.styleNumber {
                        Text("Style: \(styleNumber)")
                            .font(.system(size: 14))
                            .foregroundColor(Color(hex: "8888a0"))
                    }
                    
                    // Price range (if available)
                    if let findings = scan.refinedFindings {
                        HStack(spacing: 4) {
                            Text(findings.suggestedPriceRange.formattedRange)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(Color(hex: "22c55e"))
                            
                            Text(findings.marketActivity.emoji)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
    }
}

// MARK: - Compact Progress Bar

struct CompactProgressBar: View {
    let status: ScanStatus
    
    private let stages: [(status: ScanStatus, label: String)] = [
        (.extracting, "Read"),
        (.researching, "Search"),
        (.refining, "Analyze")
    ]
    
    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                HStack(spacing: 4) {
                    // Dot or checkmark
                    ZStack {
                        Circle()
                            .fill(dotColor(for: stage.status))
                            .frame(width: 14, height: 14)
                        
                        if isComplete(stage.status) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(.white)
                        } else if isActive(stage.status) {
                            Circle()
                                .fill(.white)
                                .frame(width: 6, height: 6)
                        }
                    }
                    
                    Text(stage.label)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(textColor(for: stage.status))
                }
                
                // Connector
                if index < stages.count - 1 {
                    Rectangle()
                        .fill(connectorColor(afterStage: stage.status))
                        .frame(width: 12, height: 2)
                        .padding(.horizontal, 2)
                }
            }
        }
    }
    
    private func stageIndex(_ s: ScanStatus) -> Int {
        switch s {
        case .extracting: return 0
        case .researching: return 1
        case .refining: return 2
        default: return -1
        }
    }
    
    private func isComplete(_ stageStatus: ScanStatus) -> Bool {
        stageIndex(stageStatus) < stageIndex(status)
    }
    
    private func isActive(_ stageStatus: ScanStatus) -> Bool {
        stageStatus == status
    }
    
    private func dotColor(for stageStatus: ScanStatus) -> Color {
        if isComplete(stageStatus) {
            return Color(hex: "22c55e")
        } else if isActive(stageStatus) {
            return Color(hex: "6366f1")
        } else {
            return Color(hex: "2a2a34")
        }
    }
    
    private func textColor(for stageStatus: ScanStatus) -> Color {
        if isComplete(stageStatus) {
            return Color(hex: "22c55e")
        } else if isActive(stageStatus) {
            return Color(hex: "6366f1")
        } else {
            return Color(hex: "8888a0")
        }
    }
    
    private func connectorColor(afterStage stageStatus: ScanStatus) -> Color {
        isComplete(stageStatus) ? Color(hex: "22c55e") : Color(hex: "2a2a34")
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: ScanStatus
    
    var body: some View {
        HStack(spacing: 4) {
            if status.isProcessing {
                ProgressView()
                    .scaleEffect(0.6)
            } else if status.needsClarification {
                Image(systemName: "questionmark.circle.fill")
                    .font(.system(size: 10))
            }
            
            Text(status.displayName)
                .font(.system(size: 12, weight: .medium))
        }
        .foregroundColor(statusColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(statusColor.opacity(0.15))
        .cornerRadius(6)
    }
    
    private var statusColor: Color {
        switch status {
        case .completed:
            return Color(hex: "22c55e")
        case .failed:
            return Color(hex: "ef4444")
        case .awaitingClarification:
            return Color(hex: "f59e0b")
        case .uploaded, .extracting, .researching, .refining:
            return Color(hex: "6366f1")
        }
    }
}

// MARK: - Processing Progress View

struct ProcessingProgressView: View {
    let status: ScanStatus
    
    private let stages: [(status: ScanStatus, label: String, icon: String)] = [
        (.extracting, "Reading", "doc.text.magnifyingglass"),
        (.researching, "Searching", "globe"),
        (.refining, "Analyzing", "chart.bar.doc.horizontal")
    ]
    
    var body: some View {
        VStack(spacing: 16) {
            // Progress steps
            HStack(spacing: 0) {
                ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                    // Step circle and label
                    VStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(fillColor(for: stage.status))
                                .frame(width: 40, height: 40)
                            
                            if isActive(stage.status) {
                                // Pulsing ring for active stage
                                Circle()
                                    .stroke(Color(hex: "6366f1"), lineWidth: 2)
                                    .frame(width: 40, height: 40)
                                    .scaleEffect(1.3)
                                    .opacity(0.5)
                                    .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: status)
                            }
                            
                            if isComplete(stage.status) {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                            } else {
                                Image(systemName: stage.icon)
                                    .font(.system(size: 16))
                                    .foregroundColor(iconColor(for: stage.status))
                            }
                        }
                        
                        Text(stage.label)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(textColor(for: stage.status))
                    }
                    
                    // Connector line (except after last)
                    if index < stages.count - 1 {
                        Rectangle()
                            .fill(connectorColor(afterStage: stage.status))
                            .frame(height: 2)
                            .frame(maxWidth: .infinity)
                            .padding(.bottom, 24) // Align with circles
                    }
                }
            }
            
            // Current action description
            Text(status.displayName)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
    }
    
    private func stageIndex(_ stageStatus: ScanStatus) -> Int {
        switch stageStatus {
        case .extracting: return 0
        case .researching: return 1
        case .refining: return 2
        default: return -1
        }
    }
    
    private func currentIndex() -> Int {
        stageIndex(status)
    }
    
    private func isComplete(_ stageStatus: ScanStatus) -> Bool {
        let current = currentIndex()
        let stage = stageIndex(stageStatus)
        return stage < current || status == .completed
    }
    
    private func isActive(_ stageStatus: ScanStatus) -> Bool {
        return stageStatus == status
    }
    
    private func isPending(_ stageStatus: ScanStatus) -> Bool {
        let current = currentIndex()
        let stage = stageIndex(stageStatus)
        return stage > current
    }
    
    private func fillColor(for stageStatus: ScanStatus) -> Color {
        if isComplete(stageStatus) {
            return Color(hex: "22c55e")
        } else if isActive(stageStatus) {
            return Color(hex: "6366f1")
        } else {
            return Color(hex: "1a1a24")
        }
    }
    
    private func iconColor(for stageStatus: ScanStatus) -> Color {
        if isActive(stageStatus) {
            return .white
        } else if isPending(stageStatus) {
            return Color(hex: "8888a0")
        }
        return .white
    }
    
    private func textColor(for stageStatus: ScanStatus) -> Color {
        if isComplete(stageStatus) {
            return Color(hex: "22c55e")
        } else if isActive(stageStatus) {
            return Color(hex: "6366f1")
        } else {
            return Color(hex: "8888a0")
        }
    }
    
    private func connectorColor(afterStage stageStatus: ScanStatus) -> Color {
        if isComplete(stageStatus) {
            return Color(hex: "22c55e")
        } else {
            return Color(hex: "1a1a24")
        }
    }
}

#Preview {
    ScanListView()
        .environmentObject(ConvexService())
}

