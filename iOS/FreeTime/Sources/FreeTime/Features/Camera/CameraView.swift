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
                    await viewModel.processImage(image)
                }
            }
        }
        .alert("Processing Error", isPresented: $viewModel.showError) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "An unknown error occurred")
        }
    }
    
    private var controlsView: some View {
        VStack(spacing: 24) {
            // Processing indicator
            if viewModel.isProcessing {
                HStack(spacing: 12) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: "6366f1")))
                    
                    Text(viewModel.processingStatus)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(hex: "8888a0"))
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 20)
                .background(Color(hex: "1a1a24"))
                .cornerRadius(20)
            }
            
            // Capture controls
            HStack(spacing: 40) {
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
                .disabled(viewModel.isProcessing)
                .opacity(viewModel.isProcessing ? 0.5 : 1)
                
                // Flash toggle
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
            }
            .padding(.bottom, 30)
        }
        .padding(.top, 20)
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
        let view = UIView()
        
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = view.bounds
        view.layer.addSublayer(previewLayer)
        
        context.coordinator.previewLayer = previewLayer
        
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.previewLayer?.frame = uiView.bounds
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }
    
    class Coordinator {
        var previewLayer: AVCaptureVideoPreviewLayer?
    }
}

// MARK: - Camera View Model

@MainActor
class CameraViewModel: NSObject, ObservableObject {
    
    // MARK: - Published Properties
    
    @Published var hasPermission = false
    @Published var isProcessing = false
    @Published var processingStatus = ""
    @Published var isFlashOn = false
    @Published var showError = false
    @Published var errorMessage: String?
    
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
    
    // MARK: - Image Processing
    
    func processImage(_ image: UIImage) async {
        guard let convexService = convexService else {
            errorMessage = "Service not available"
            showError = true
            return
        }
        
        isProcessing = true
        processingStatus = "Analyzing image..."
        
        do {
            // Step 1: On-device Vision analysis
            print("[Process] Step 1: Vision analysis...")
            processingStatus = "Reading tag..."
            let tagAnalysis = try await visionService.analyzeTag(image: image)
            print("[Process] Vision found \(tagAnalysis.allHints.count) hints")
            
            // Step 2: Upload image to Convex
            print("[Process] Step 2: Uploading image...")
            processingStatus = "Uploading..."
            guard let imageData = image.jpegData(compressionQuality: 0.8) else {
                throw NSError(domain: "TagScanner", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to compress image"])
            }
            print("[Process] Image size: \(imageData.count / 1024)KB")
            
            let storageId = try await convexService.uploadImage(data: imageData, mimeType: "image/jpeg")
            print("[Process] Uploaded, storageId: \(storageId)")
            
            // Step 3: Create scan record
            print("[Process] Step 3: Creating scan...")
            processingStatus = "Creating scan..."
            let scanId = try await convexService.createScan(imageStorageId: storageId)
            print("[Process] Created scan: \(scanId)")
            
            // Step 4: Start pipeline processing (this takes 60-90 seconds!)
            print("[Process] Step 4: Running pipeline (this may take 60-90 seconds)...")
            processingStatus = "Analyzing with AI..."
            try await convexService.processScan(
                scanId: scanId,
                imageStorageId: storageId,
                onDeviceHints: tagAnalysis.allHints
            )
            print("[Process] Pipeline complete!")
            
            processingStatus = "Complete!"
            
            // Refresh scans list
            try await convexService.fetchUserScans()
            
        } catch let error as NSError {
            print("[Process] Error: \(error.domain) code=\(error.code) \(error.localizedDescription)")
            if error.code == -1001 {
                errorMessage = "Processing timed out. The AI analysis takes 60-90 seconds. Please try again."
            } else {
                errorMessage = error.localizedDescription
            }
            showError = true
        } catch {
            print("[Process] Error: \(error)")
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
            
            await self.processImage(image)
        }
    }
}

#Preview {
    CameraView()
        .environmentObject(ConvexService())
}

