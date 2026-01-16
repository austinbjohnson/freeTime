import SwiftUI
@preconcurrency import AVFoundation
import PhotosUI

struct CameraView: View {
    @EnvironmentObject var convexService: ConvexService
    @EnvironmentObject var navigationState: AppNavigationState
    @EnvironmentObject var networkMonitor: NetworkMonitor
    @EnvironmentObject var offlineQueueManager: OfflineQueueManager
    @StateObject private var viewModel = CameraViewModel()
    @State private var showingImagePicker = false
    @State private var selectedItem: PhotosPickerItem?
    @State private var submissionAnimation: SubmissionAnimation?
    @State private var submissionAnimationProgress: CGFloat = 0
    @State private var isQueueTrayVisible = false
    @State private var queueSelectedScan: Scan?
    private let activeQueueWindow: TimeInterval = 600
    private let completedQueueWindow: TimeInterval = 300
    
    var body: some View {
        ZStack {
            // Background
            Color(hex: "0a0a0f")
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Camera Preview
                if viewModel.hasPermission {
                    CameraPreviewView(session: viewModel.session)
                        .ignoresSafeArea()
                        .overlay(alignment: .top) {
                            // Top gradient for status bar
                            LinearGradient(
                                colors: [Color.black.opacity(0.6), .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            .frame(height: 100)
                            .ignoresSafeArea()
                        }
                        .overlay(alignment: .topTrailing) {
                            // Image count badge
                            if !viewModel.capturedImages.isEmpty {
                                Text("\(viewModel.capturedImages.count)")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.white)
                                    .frame(width: 28, height: 28)
                                    .background(Color(hex: "6366f1"))
                                    .clipShape(Circle())
                                    .padding(.trailing, 20)
                                    .padding(.top, 60)
                            }
                        }
                } else {
                    // Permission denied or not determined
                    VStack(spacing: 20) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 60))
                            .foregroundColor(Color(hex: "8888a0"))
                        
                        Text("Camera Access Required")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.white)
                        
                        Text("Please enable camera access in Settings to scan clothing tags.")
                            .font(.system(size: 16))
                            .foregroundColor(Color(hex: "8888a0"))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                        
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                        .foregroundColor(Color(hex: "6366f1"))
                        .font(.system(size: 16, weight: .semibold))
                    }
                }
                
                // Photo Strip (when images captured)
                if !viewModel.capturedImages.isEmpty {
                    photoStripView
                }
                
                // Bottom Controls
                controlsView
            }
            
            submissionAnimationOverlay
            queueChipOverlay
            queueTrayOverlay
        }
        .onAppear {
            viewModel.checkPermissions()
            viewModel.convexService = convexService
            viewModel.offlineQueueManager = offlineQueueManager
        }
        .onChange(of: selectedItem) { _, newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    viewModel.addCapturedImage(image)
                    selectedItem = nil
                }
            }
        }
        .alert("Processing Error", isPresented: $viewModel.showError) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "An unknown error occurred")
        }
        .sheet(item: $queueSelectedScan) { scan in
            ScanDetailView(scan: scan)
        }
    }
    
    // MARK: - Photo Strip
    
    private var photoStripView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(Array(viewModel.capturedImages.enumerated()), id: \.element.id) { index, captured in
                    ZStack {
                        Image(uiImage: captured.thumbnail)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 70, height: 70)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color(hex: "6366f1"), lineWidth: 2)
                            )
                        
                        // Image number badge (bottom left, inside)
                        VStack {
                            Spacer()
                            HStack {
                                Text("\(index + 1)")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.white)
                                    .frame(width: 20, height: 20)
                                    .background(Color(hex: "6366f1"))
                                    .clipShape(Circle())
                                    .padding(4)
                                Spacer()
                            }
                        }
                        
                        // Delete button (top right, inside)
                        VStack {
                            HStack {
                                Spacer()
                                Button {
                                    withAnimation {
                                        viewModel.removeCapturedImage(at: index)
                                    }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 18))
                                        .foregroundStyle(.white, Color(hex: "ef4444"))
                                }
                                .padding(4)
                            }
                            Spacer()
                        }
                    }
                    .frame(width: 70, height: 70)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 4)
        }
        .frame(height: 86)
        .padding(.vertical, 4)
        .background(Color(hex: "0a0a0f"))
    }
    
    // MARK: - Controls
    
    private var controlsView: some View {
        VStack(spacing: 16) {
            // Hint text
            Text(hintText)
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "8888a0"))
            
            // Capture controls
            HStack(spacing: 30) {
                // Photo library button
                PhotosPicker(selection: $selectedItem, matching: .images) {
                    ZStack {
                        Circle()
                            .fill(Color(hex: "1a1a24"))
                            .frame(width: 52, height: 52)
                        
                        Image(systemName: "photo.on.rectangle")
                            .font(.system(size: 22, weight: .medium))
                            .foregroundColor(.white)
                    }
                }
                .disabled(viewModel.capturedImages.count >= 5)
                .opacity(viewModel.capturedImages.count >= 5 ? 0.5 : 1)
                
                // Capture button
                Button {
                    viewModel.capturePhoto()
                } label: {
                    ZStack {
                        Circle()
                            .stroke(Color.white, lineWidth: 4)
                            .frame(width: 72, height: 72)
                        
                        Circle()
                            .fill(Color.white)
                            .frame(width: 60, height: 60)
                    }
                }
                .disabled(viewModel.capturedImages.count >= 5)
                .opacity(viewModel.capturedImages.count >= 5 ? 0.5 : 1)
                
                // Done / Flash button
                if viewModel.capturedImages.isEmpty {
                    // Flash toggle when no images
                    Button {
                        viewModel.toggleFlash()
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color(hex: "1a1a24"))
                                .frame(width: 52, height: 52)
                            
                            Image(systemName: viewModel.isFlashOn ? "bolt.fill" : "bolt.slash.fill")
                                .font(.system(size: 22, weight: .medium))
                                .foregroundColor(viewModel.isFlashOn ? Color(hex: "f59e0b") : .white)
                        }
                    }
                } else {
                    // Done button when images captured
                    Button {
                        if let thumbnail = viewModel.submitAllImages() {
                            triggerSubmissionAnimation(thumbnail: thumbnail)
                        }
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color(hex: "22c55e"))
                                .frame(width: 52, height: 52)
                            
                            Image(systemName: "checkmark")
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                }
            }
            .padding(.bottom, 30)
        }
        .padding(.top, 12)
        .background(
            Color(hex: "0a0a0f")
                .ignoresSafeArea()
        )
    }

    private var hintText: String {
        let queuedCount = pendingLocalQueueCount(using: convexService.scans)
        let offlineQueued = offlineQueueManager.pendingCount
        if viewModel.capturedImages.isEmpty {
            if convexService.isOffline {
                if offlineQueued > 0 {
                    return "Offline • \(offlineQueued) queued for upload"
                }
                return "Offline • Scans will upload when back online"
            }
            if offlineQueued > 0 {
                return "Uploading \(offlineQueued) queued item\(offlineQueued == 1 ? "" : "s")"
            }
            if queuedCount > 0 {
                return "Queued \(queuedCount) item\(queuedCount == 1 ? "" : "s") • Ready for next item"
            }
            return "Take photos of tag, garment, and condition"
        }
        return "\(viewModel.capturedImages.count)/5 photos • Tap Done when ready"
    }
    
    private var queueChipOverlay: some View {
        let buckets = queueBuckets
        let offlineQueued = offlineQueueManager.pendingCount
        let queuedLocal = pendingLocalQueueCount(using: convexService.scans)
        let queueCount = queuedLocal + offlineQueued + buckets.active.count
        let hasQueueItems = queueCount > 0 || !buckets.completed.isEmpty
        let queueLabel = queueCount > 0 ? "Queue \(queueCount)" : "Queue"
        return VStack {
            Spacer()
            if hasQueueItems {
                HStack {
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                            isQueueTrayVisible = true
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "tray.full.fill")
                                .font(.system(size: 14, weight: .semibold))
                            Text(queueLabel)
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color(hex: "1a1a24").opacity(0.95))
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(Color.white.opacity(0.12), lineWidth: 1)
                        )
                    }
                    .accessibilityLabel(queueLabel)
                    .padding(.trailing, 16)
                    .padding(.bottom, 140)
                }
            }
        }
        .allowsHitTesting(hasQueueItems)
    }
    
    private var queueTrayOverlay: some View {
        ZStack {
            if isQueueTrayVisible {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                            isQueueTrayVisible = false
                        }
                    }
                
                VStack {
                    Spacer()
                    queueTrayView
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: isQueueTrayVisible)
    }
    
    private var submissionAnimationOverlay: some View {
        GeometryReader { proxy in
            if let animation = submissionAnimation {
                let bottomInset = proxy.safeAreaInsets.bottom
                let endY = proxy.size.height - (bottomInset + 24)
                let startY = endY - 140
                let x = proxy.size.width / 2
                
                Image(uiImage: animation.thumbnail)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 70, height: 70)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .position(x: x, y: startY + (endY - startY) * submissionAnimationProgress)
                    .scaleEffect(1 - (submissionAnimationProgress * 0.6))
                    .opacity(1 - submissionAnimationProgress)
            }
        }
        .allowsHitTesting(false)
    }
    
    private func triggerSubmissionAnimation(thumbnail: UIImage) {
        submissionAnimation = SubmissionAnimation(thumbnail: thumbnail)
        submissionAnimationProgress = 0
        withAnimation(.spring(response: 0.6, dampingFraction: 0.75)) {
            submissionAnimationProgress = 1
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            submissionAnimation = nil
        }
    }

    private var queueTrayView: some View {
        let queuedLocal = pendingLocalQueueCount(using: convexService.scans)
        let offlineQueued = offlineQueueManager.pendingCount
        let buckets = queueBuckets
        let activeRecentScans = buckets.active
        let completedRecentScans = buckets.completed
        let queueScans = activeRecentScans + completedRecentScans

        return VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Queue")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                    Text("\(activeRecentScans.count) active • \(completedRecentScans.count) completed (5m)")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8888a0"))
                }
                
                Spacer()
                
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                        isQueueTrayVisible = false
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: "8888a0"))
                        .frame(width: 32, height: 32)
                        .background(Color(hex: "1a1a24"))
                        .clipShape(Circle())
                }
            }
            
            ScrollView {
                VStack(spacing: 12) {
                    if queuedLocal > 0 {
                        queueInfoRow(
                            icon: "arrow.up.circle.fill",
                            title: "Uploading queued items",
                            subtitle: "\(queuedLocal) waiting to start"
                        )
                    }
                    if offlineQueued > 0 {
                        queueInfoRow(
                            icon: "wifi.slash",
                            title: "Offline queue",
                            subtitle: "\(offlineQueued) ready when back online"
                        )
                    }

                    ForEach(Array(queueScans), id: \.id) { scan in
                        Button {
                            openQueueScan(scan)
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                                isQueueTrayVisible = false
                            }
                        } label: {
                            queueScanRow(scan)
                        }
                        .buttonStyle(.plain)
                    }

                    if queuedLocal == 0 && offlineQueued == 0 && queueScans.isEmpty {
                        Text("No active scans in the last 10 minutes.")
                            .font(.system(size: 13))
                            .foregroundColor(Color(hex: "8888a0"))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 12)
                    }
                }
            }
            .frame(maxHeight: 320)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Color(hex: "0f1117"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 20)
    }
    
    private func queueInfoRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(hex: "6366f1"))
                .frame(width: 36, height: 36)
                .background(Color(hex: "1a1a24"))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "8888a0"))
            }
            Spacer()
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(hex: "1a1a24").opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }
    
    private func queueScanRow(_ scan: Scan) -> some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: URL(string: scan.thumbnailUrl ?? scan.imageUrl ?? "")) { image in
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
            .frame(width: 52, height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            
            VStack(alignment: .leading, spacing: 4) {
                Text(scan.extractedData?.brand ?? "Processing item")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                
                if scan.status.needsClarification {
                    Text("Needs your input")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: "f59e0b"))
                } else if let styleNumber = scan.extractedData?.styleNumber {
                    Text("Style \(styleNumber)")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8888a0"))
                } else {
                    Text(scan.createdAt, style: .time)
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8888a0"))
                }
            }
            
            Spacer()
            
            HStack(spacing: 6) {
                Circle()
                    .fill(statusColor(for: scan.status))
                    .frame(width: 8, height: 8)
                Text(scan.status.displayName)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "d1d5db"))
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(hex: "1a1a24").opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }
    
    private func statusColor(for status: ScanStatus) -> Color {
        switch status {
        case .uploaded:
            return Color(hex: "6366f1")
        case .extracting:
            return Color(hex: "f59e0b")
        case .awaitingClarification:
            return Color(hex: "f59e0b")
        case .researching:
            return Color(hex: "38bdf8")
        case .refining:
            return Color(hex: "22c55e")
        case .completed:
            return Color(hex: "22c55e")
        case .failed:
            return Color(hex: "ef4444")
        }
    }

    private func openQueueScan(_ scan: Scan) {
        queueSelectedScan = scan
    }
    
    private var queueBuckets: (active: [Scan], completed: [Scan]) {
        let now = Date()
        let activeCutoff = now.addingTimeInterval(-activeQueueWindow)
        let completedCutoff = now.addingTimeInterval(-completedQueueWindow)
        let active = convexService.scans
            .filter { $0.createdAt >= activeCutoff && !isCompletedStatus($0.status) }
            .sorted { $0.createdAt > $1.createdAt }
        let completed = convexService.scans
            .filter { $0.createdAt >= completedCutoff && isCompletedStatus($0.status) }
            .sorted { $0.createdAt > $1.createdAt }
        return (active, completed)
    }

    private func pendingLocalQueueCount(using scans: [Scan]) -> Int {
        let totalQueued = viewModel.queuedItemCount
        guard totalQueued > 0, let currentScanId = viewModel.currentSubmissionScanId else {
            return totalQueued
        }
        let hasCurrentScan = scans.contains { $0.id == currentScanId }
        return max(totalQueued - (hasCurrentScan ? 1 : 0), 0)
    }
    
    private func isCompletedStatus(_ status: ScanStatus) -> Bool {
        status == .completed
    }
}

// MARK: - Camera Preview

struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession
    
    func makeUIView(context: Context) -> UIView {
        let view = PreviewView()
        view.backgroundColor = .black
        
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        
        // Store reference for updates
        view.previewLayer = previewLayer
        context.coordinator.previewLayer = previewLayer
        
        print("[Camera] Preview layer created")
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        // Update frame when view size changes
        DispatchQueue.main.async {
            context.coordinator.previewLayer?.frame = uiView.bounds
            print("[Camera] Preview frame updated: \(uiView.bounds)")
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }
    
    class Coordinator {
        var previewLayer: AVCaptureVideoPreviewLayer?
    }
}

// Custom UIView that updates preview layer frame on layout
class PreviewView: UIView {
    var previewLayer: AVCaptureVideoPreviewLayer?
    
    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }
}

// MARK: - Processing Stage Enum

enum ProcessingStage: Int, CaseIterable {
    case uploading = 0
    case extracting = 1
    case researching = 2
    case refining = 3
    case complete = 4
    
    var label: String {
        switch self {
        case .uploading: return "Upload"
        case .extracting: return "Reading"
        case .researching: return "Searching"
        case .refining: return "Analyzing"
        case .complete: return "Done"
        }
    }
    
    var icon: String {
        switch self {
        case .uploading: return "arrow.up.circle"
        case .extracting: return "doc.text.magnifyingglass"
        case .researching: return "globe"
        case .refining: return "chart.bar.doc.horizontal"
        case .complete: return "checkmark.circle"
        }
    }
}

// MARK: - Camera Processing Stages View

struct CameraProcessingStages: View {
    let currentStage: ProcessingStage
    
    private let stages: [ProcessingStage] = [.uploading, .extracting, .researching, .refining]
    
    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(stages.enumerated()), id: \.element) { index, stage in
                // Stage circle
                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(fillColor(for: stage))
                            .frame(width: 32, height: 32)
                        
                        if isComplete(stage) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                        } else {
                            Image(systemName: stage.icon)
                                .font(.system(size: 12))
                                .foregroundColor(iconColor(for: stage))
                        }
                        
                        // Pulsing ring for active
                        if isActive(stage) {
                            Circle()
                                .stroke(Color(hex: "6366f1").opacity(0.5), lineWidth: 2)
                                .frame(width: 32, height: 32)
                                .scaleEffect(1.4)
                        }
                    }
                    
                    Text(stage.label)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(textColor(for: stage))
                }
                
                // Connector line
                if index < stages.count - 1 {
                    Rectangle()
                        .fill(connectorColor(afterStage: stage))
                        .frame(height: 2)
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 20)
                }
            }
        }
    }
    
    private func isComplete(_ stage: ProcessingStage) -> Bool {
        stage.rawValue < currentStage.rawValue
    }
    
    private func isActive(_ stage: ProcessingStage) -> Bool {
        stage == currentStage
    }
    
    private func fillColor(for stage: ProcessingStage) -> Color {
        if isComplete(stage) {
            return Color(hex: "22c55e")
        } else if isActive(stage) {
            return Color(hex: "6366f1")
        } else {
            return Color(hex: "1a1a24")
        }
    }
    
    private func iconColor(for stage: ProcessingStage) -> Color {
        if isActive(stage) {
            return .white
        } else {
            return Color(hex: "8888a0")
        }
    }
    
    private func textColor(for stage: ProcessingStage) -> Color {
        if isComplete(stage) {
            return Color(hex: "22c55e")
        } else if isActive(stage) {
            return Color(hex: "6366f1")
        } else {
            return Color(hex: "8888a0")
        }
    }
    
    private func connectorColor(afterStage stage: ProcessingStage) -> Color {
        isComplete(stage) ? Color(hex: "22c55e") : Color(hex: "1a1a24")
    }
}

// MARK: - Captured Image Model

struct CapturedImage: Identifiable {
    let id = UUID()
    let image: UIImage
    let thumbnail: UIImage
    let capturedAt: Date
    
    init(image: UIImage) {
        self.image = image
        self.thumbnail = CapturedImage.createThumbnail(from: image)
        self.capturedAt = Date()
    }
    
    private static func createThumbnail(from image: UIImage, size: CGSize = CGSize(width: 140, height: 140)) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

struct SubmissionPayload: Identifiable {
    let id = UUID()
    let images: [CapturedImage]
    let submittedAt: Date
    
    init(images: [CapturedImage]) {
        self.images = images
        self.submittedAt = Date()
    }
}

struct SubmissionAnimation {
    let thumbnail: UIImage
}

// MARK: - Camera View Model

@MainActor
class CameraViewModel: NSObject, ObservableObject {
    
    // MARK: - Published Properties
    
    @Published var hasPermission = false
    @Published var processingStatus = ""
    @Published var processingStage: ProcessingStage = .uploading
    @Published var isFlashOn = false
    @Published var showError = false
    @Published var errorMessage: String?
    @Published var capturedImages: [CapturedImage] = []
    @Published var queuedItemCount = 0
    @Published var currentSubmissionScanId: String?
    
    // MARK: - Services
    
    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.freetime.camera.session", qos: .userInitiated)
    private let visionService = VisionService()
    var convexService: ConvexService?
    var offlineQueueManager: OfflineQueueManager?
    
    private var photoOutput: AVCapturePhotoOutput?
    private var submissionQueue: [SubmissionPayload] = []
    private var isQueueProcessing = false
    
    // MARK: - Permissions
    
    func checkPermissions() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            hasPermission = true
            setupCamera()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                Task { @MainActor in
                    self?.hasPermission = granted
                    if granted {
                        self?.setupCamera()
                    }
                }
            }
        default:
            hasPermission = false
        }
    }
    
    // MARK: - Camera Setup
    
    private func setupCamera() {
        let session = session
        sessionQueue.async { [weak self] in
            session.beginConfiguration()
            session.sessionPreset = .photo
            
            // Add camera input
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
                print("[Camera] No back camera available")
                session.commitConfiguration()
                return
            }
            
            do {
                let input = try AVCaptureDeviceInput(device: device)
                if session.canAddInput(input) {
                    session.addInput(input)
                } else {
                    print("[Camera] Cannot add camera input")
                    session.commitConfiguration()
                    return
                }
            } catch {
                print("[Camera] Error creating input: \(error)")
                session.commitConfiguration()
                return
            }
            
            // Add photo output
            let output = AVCapturePhotoOutput()
            if session.canAddOutput(output) {
                session.addOutput(output)
                Task { @MainActor in
                    self?.photoOutput = output
                }
            } else {
                print("[Camera] Cannot add photo output")
            }
            
            session.commitConfiguration()
            
            // Start the session
            print("[Camera] Starting capture session...")
            session.startRunning()
            print("[Camera] Session running: \(session.isRunning)")
        }
    }
    
    // MARK: - Capture
    
    func capturePhoto() {
        guard let photoOutput = photoOutput else { return }
        
        var settings = AVCapturePhotoSettings()
        if photoOutput.availablePhotoCodecTypes.contains(.hevc) {
            settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.hevc])
        }
        
        settings.flashMode = isFlashOn ? .on : .off
        
        photoOutput.capturePhoto(with: settings, delegate: self)
    }
    
    func toggleFlash() {
        isFlashOn.toggle()
    }
    
    // MARK: - Multi-Image Management
    
    func addCapturedImage(_ image: UIImage) {
        guard capturedImages.count < 5 else {
            errorMessage = "Maximum 5 images per scan"
            showError = true
            return
        }
        
        withAnimation(.spring(response: 0.3)) {
            capturedImages.append(CapturedImage(image: image))
        }
        print("[Camera] Added image. Total: \(capturedImages.count)")
    }
    
    func removeCapturedImage(at index: Int) {
        guard index >= 0 && index < capturedImages.count else { return }
        capturedImages.remove(at: index)
        print("[Camera] Removed image at \(index). Total: \(capturedImages.count)")
    }
    
    func clearCapturedImages() {
        capturedImages.removeAll()
    }
    
    // MARK: - Submit All Images
    
    func submitAllImages() -> UIImage? {
        guard !capturedImages.isEmpty else { return nil }
        let images = capturedImages
        let thumbnail = capturedImages.first?.thumbnail
        clearCapturedImages()
        
        if convexService?.isOffline == true {
            Task {
                await queueOfflineSubmission(images)
            }
            return thumbnail
        }
        
        let submission = SubmissionPayload(images: images)
        submissionQueue.append(submission)
        updateQueuedItemCount()
        processQueueIfNeeded()
        
        return thumbnail
    }

    private func queueOfflineSubmission(_ images: [CapturedImage]) async {
        guard let offlineQueueManager else { return }
        
        var allHints: [String] = []
        for captured in images {
            let tagAnalysis = await visionService.analyzeTag(image: captured.image)
            allHints.append(contentsOf: tagAnalysis.allHints)
        }
        
        let uniqueHints = Array(Set(allHints))
        let queued = offlineQueueManager.enqueue(images: images.map(\.image), hints: uniqueHints)
        if !queued {
            errorMessage = "Failed to queue submission offline. Please try again."
            showError = true
        }
    }
    
    private func processQueueIfNeeded() {
        guard !isQueueProcessing else { return }
        guard let submission = submissionQueue.first else { return }
        isQueueProcessing = true
        
        Task {
            await processSubmission(submission)
        }
    }
    
    private func processSubmission(_ submission: SubmissionPayload) async {
        guard let convexService else {
            errorMessage = "Service not available"
            showError = true
            finishCurrentSubmission()
            return
        }
        
        processingStage = .uploading
        processingStatus = "Preparing images..."
        
        do {
            // Collect all hints from vision analysis
            var allHints: [String] = []
            var storageIds: [String] = []
            
            for (index, captured) in submission.images.enumerated() {
                processingStatus = "Reading image \(index + 1)/\(submission.images.count)..."
                
                let tagAnalysis = await visionService.analyzeTag(image: captured.image)
                allHints.append(contentsOf: tagAnalysis.allHints)
                
                processingStatus = "Uploading \(index + 1)/\(submission.images.count)..."
                guard let imageData = captured.image.jpegData(compressionQuality: 0.8) else {
                    throw NSError(domain: "Camera", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to compress image \(index + 1)"])
                }
                
                let storageId = try await convexService.uploadImage(data: imageData, mimeType: "image/jpeg")
                storageIds.append(storageId)
                print("[Camera] Uploaded image \(index + 1): \(storageId)")
            }
            
            processingStage = .extracting
            processingStatus = "AI reading tags..."
            let scanId = try await convexService.createScan(imageStorageId: storageIds[0])
            currentSubmissionScanId = scanId
            print("[Camera] Created scan: \(scanId)")
            
            let processingTask = Task {
                try await convexService.processMultiImageScan(
                    scanId: scanId,
                    imageStorageIds: storageIds,
                    onDeviceHints: allHints.isEmpty ? nil : Array(Set(allHints))
                )
            }
            
            try await Task.sleep(nanoseconds: UInt64(submission.images.count * 3) * 1_000_000_000)
            if !processingTask.isCancelled {
                processingStage = .researching
                processingStatus = "Searching market data..."
            }
            
            try await Task.sleep(nanoseconds: 8_000_000_000)
            if !processingTask.isCancelled {
                processingStage = .refining
                processingStatus = "Analyzing prices..."
            }
            
            try await processingTask.value
            processingStage = .complete
            processingStatus = "Complete!"
            print("[Camera] Multi-image processing complete!")
        } catch let error as NSError {
            print("[Camera] Error: \(error.domain) code=\(error.code) \(error.localizedDescription)")
            if error.code == -1001 {
                errorMessage = "Processing timed out. The AI analysis takes 60-90 seconds. Please try again."
            } else {
                errorMessage = error.localizedDescription
            }
            showError = true
        } catch {
            print("[Camera] Error: \(error)")
            errorMessage = error.localizedDescription
            showError = true
        }
        
        finishCurrentSubmission()
    }
    
    private func finishCurrentSubmission() {
        if !submissionQueue.isEmpty {
            submissionQueue.removeFirst()
        }
        isQueueProcessing = false
        currentSubmissionScanId = nil
        updateQueuedItemCount()
        processQueueIfNeeded()
    }
    
    private func updateQueuedItemCount() {
        queuedItemCount = submissionQueue.count
    }
}

// MARK: - Photo Capture Delegate

extension CameraViewModel: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        Task { @MainActor in
            if let error = error {
                self.errorMessage = error.localizedDescription
                self.showError = true
                return
            }
            
            guard let data = photo.fileDataRepresentation(),
                  let image = UIImage(data: data) else {
                self.errorMessage = "Failed to capture photo"
                self.showError = true
                return
            }
            
            // Add to captured images instead of immediately processing
            self.addCapturedImage(image)
        }
    }
}

#Preview {
    CameraView()
        .environmentObject(ConvexService())
        .environmentObject(AppNavigationState())
        .environmentObject(NetworkMonitor())
        .environmentObject(OfflineQueueManager())
}
