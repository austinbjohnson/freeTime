import SwiftUI
import AVFoundation
import PhotosUI

struct CameraView: View {
    @EnvironmentObject var convexService: ConvexService
    @StateObject private var viewModel = CameraViewModel()
    @State private var showingImagePicker = false
    @State private var selectedItem: PhotosPickerItem?
    
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
        }
        .onAppear {
            viewModel.checkPermissions()
            viewModel.convexService = convexService
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
            // Processing indicator with stage stepper
            if viewModel.isProcessing {
                VStack(spacing: 12) {
                    // Stage stepper
                    CameraProcessingStages(currentStage: viewModel.processingStage)
                    
                    // Status text
                    HStack(spacing: 8) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: "6366f1")))
                            .scaleEffect(0.8)
                        
                        Text(viewModel.processingStatus)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(hex: "8888a0"))
                    }
                }
                .padding(.vertical, 16)
                .padding(.horizontal, 20)
                .background(Color(hex: "12121a"))
                .cornerRadius(16)
                .padding(.horizontal)
            }
            
            // Hint text
            if !viewModel.isProcessing {
                Text(viewModel.capturedImages.isEmpty 
                    ? "Take photos of tag, garment, and condition" 
                    : "\(viewModel.capturedImages.count)/5 photos • Tap Done when ready")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "8888a0"))
            }
            
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
                .disabled(viewModel.isProcessing || viewModel.capturedImages.count >= 5)
                .opacity(viewModel.isProcessing || viewModel.capturedImages.count >= 5 ? 0.5 : 1)
                
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
                .disabled(viewModel.isProcessing || viewModel.capturedImages.count >= 5)
                .opacity(viewModel.isProcessing || viewModel.capturedImages.count >= 5 ? 0.5 : 1)
                
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
                        Task {
                            await viewModel.submitAllImages()
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
                    .disabled(viewModel.isProcessing)
                    .opacity(viewModel.isProcessing ? 0.5 : 1)
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

// MARK: - Camera View Model

@MainActor
class CameraViewModel: NSObject, ObservableObject {
    
    // MARK: - Published Properties
    
    @Published var hasPermission = false
    @Published var isProcessing = false
    @Published var processingStatus = ""
    @Published var processingStage: ProcessingStage = .uploading
    @Published var isFlashOn = false
    @Published var showError = false
    @Published var errorMessage: String?
    @Published var capturedImages: [CapturedImage] = []
    
    // MARK: - Services
    
    let session = AVCaptureSession()
    private let visionService = VisionService()
    var convexService: ConvexService?
    
    private var photoOutput: AVCapturePhotoOutput?
    
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
        // Run camera setup on background queue to avoid blocking UI
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo
            
            // Add camera input
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
                print("[Camera] No back camera available")
                self.session.commitConfiguration()
                return
            }
            
            do {
                let input = try AVCaptureDeviceInput(device: device)
                if self.session.canAddInput(input) {
                    self.session.addInput(input)
                } else {
                    print("[Camera] Cannot add camera input")
                    self.session.commitConfiguration()
                    return
                }
            } catch {
                print("[Camera] Error creating input: \(error)")
                self.session.commitConfiguration()
                return
            }
            
            // Add photo output
            let output = AVCapturePhotoOutput()
            if self.session.canAddOutput(output) {
                self.session.addOutput(output)
                self.photoOutput = output
            } else {
                print("[Camera] Cannot add photo output")
            }
            
            self.session.commitConfiguration()
            
            // Start the session
            print("[Camera] Starting capture session...")
            self.session.startRunning()
            print("[Camera] Session running: \(self.session.isRunning)")
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
    
    func submitAllImages() async {
        guard !capturedImages.isEmpty else { return }
        guard let convexService = convexService else {
            errorMessage = "Service not available"
            showError = true
            return
        }
        
        isProcessing = true
        processingStage = .uploading
        processingStatus = "Preparing images..."
        
        do {
            // Collect all hints from vision analysis
            var allHints: [String] = []
            var storageIds: [String] = []
            
            // Step 1: Analyze and upload each image
            for (index, captured) in capturedImages.enumerated() {
                processingStatus = "Reading image \(index + 1)/\(capturedImages.count)..."
                
                // On-device Vision analysis
                let tagAnalysis = try await visionService.analyzeTag(image: captured.image)
                allHints.append(contentsOf: tagAnalysis.allHints)
                
                // Upload image
                processingStatus = "Uploading \(index + 1)/\(capturedImages.count)..."
                guard let imageData = captured.image.jpegData(compressionQuality: 0.8) else {
                    throw NSError(domain: "Camera", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to compress image \(index + 1)"])
                }
                
                let storageId = try await convexService.uploadImage(data: imageData, mimeType: "image/jpeg")
                storageIds.append(storageId)
                print("[Camera] Uploaded image \(index + 1): \(storageId)")
            }
            
            // Step 2: Create scan and start extraction
            processingStage = .extracting
            processingStatus = "AI reading tags..."
            let scanId = try await convexService.createScan(imageStorageId: storageIds[0])
            print("[Camera] Created scan: \(scanId)")
            
            // Step 3: Process with multi-image pipeline
            // Note: The pipeline internally goes through extraction → research → refinement
            // We'll update the stage based on typical timing since we can't get real-time updates here
            
            // Start the pipeline (this blocks until complete)
            let processingTask = Task {
                try await convexService.processMultiImageScan(
                    scanId: scanId,
                    imageStorageIds: storageIds,
                    onDeviceHints: allHints.isEmpty ? nil : Array(Set(allHints))
                )
            }
            
            // Simulate stage progression while waiting
            // Extraction typically takes 3-8 seconds per image
            try await Task.sleep(nanoseconds: UInt64(capturedImages.count * 3) * 1_000_000_000)
            if !processingTask.isCancelled {
                processingStage = .researching
                processingStatus = "Searching market data..."
            }
            
            // Research typically takes 5-15 seconds
            try await Task.sleep(nanoseconds: 8_000_000_000)
            if !processingTask.isCancelled {
                processingStage = .refining
                processingStatus = "Analyzing prices..."
            }
            
            // Wait for actual completion
            try await processingTask.value
            
            processingStage = .complete
            processingStatus = "Complete!"
            print("[Camera] Multi-image processing complete!")
            
            // Clear captured images
            clearCapturedImages()
            
            // Refresh scans list
            try await convexService.fetchUserScans()
            
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
        
        isProcessing = false
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
}
