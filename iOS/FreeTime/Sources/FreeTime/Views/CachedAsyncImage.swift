import SwiftUI

/// A drop-in replacement for AsyncImage that uses ImageCacheService for caching
/// Supports both memory and disk caching for instant loads on subsequent views
struct CachedAsyncImage<Content: View, Placeholder: View>: View {
    
    let url: URL?
    let scale: CGFloat
    @ViewBuilder let content: (Image) -> Content
    @ViewBuilder let placeholder: () -> Placeholder
    
    @State private var loadedImage: UIImage?
    @State private var isLoading = false
    
    private let cache = ImageCacheService.shared
    
    init(
        url: URL?,
        scale: CGFloat = 1.0,
        @ViewBuilder content: @escaping (Image) -> Content,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.scale = scale
        self.content = content
        self.placeholder = placeholder
    }
    
    var body: some View {
        Group {
            if let loadedImage {
                content(Image(uiImage: loadedImage))
            } else {
                placeholder()
                    .onAppear {
                        loadImage()
                    }
            }
        }
    }
    
    private func loadImage() {
        guard !isLoading else { return }
        guard let url else { return }
        
        let cacheKey = url.absoluteString
        
        // 1. Check cache first (synchronous)
        if let cached = cache.image(for: cacheKey) {
            loadedImage = cached
            return
        }
        
        // 2. Fetch from network
        isLoading = true
        
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                
                guard let image = UIImage(data: data) else {
                    print("[CachedAsyncImage] Invalid image data from: \(url)")
                    isLoading = false
                    return
                }
                
                // Cache the image
                cache.setImage(image, for: cacheKey)
                
                // Update UI on main thread
                await MainActor.run {
                    loadedImage = image
                    isLoading = false
                }
            } catch {
                print("[CachedAsyncImage] Failed to load: \(error.localizedDescription)")
                isLoading = false
            }
        }
    }
}

// MARK: - Convenience Initializer (matches AsyncImage API)

extension CachedAsyncImage where Content == Image, Placeholder == ProgressView<EmptyView, EmptyView> {
    
    /// Simple initializer that displays the image directly with a ProgressView placeholder
    init(url: URL?, scale: CGFloat = 1.0) {
        self.init(
            url: url,
            scale: scale,
            content: { $0 },
            placeholder: { ProgressView() }
        )
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 20) {
        // With custom content and placeholder
        CachedAsyncImage(
            url: URL(string: "https://picsum.photos/200")
        ) { image in
            image
                .resizable()
                .aspectRatio(contentMode: .fill)
        } placeholder: {
            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .overlay {
                    ProgressView()
                }
        }
        .frame(width: 100, height: 100)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        
        // Simple usage
        CachedAsyncImage(url: URL(string: "https://picsum.photos/150"))
            .frame(width: 150, height: 150)
    }
    .padding()
}

