import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Camera, 
  UploadCloud, 
  Trash2, 
  Search, 
  RefreshCw, 
  FileDown, 
  Check, 
  AlertCircle, 
  Info, 
  BookMarked,
  X,
  Plus
} from 'lucide-react';

interface Book {
  id: string;
  title: string;
  author: string;
  publisher: string;
  publishedDate: string;
  description: string;
  coverImage?: string;
  addedAt: string;
}

interface ImageState {
  preview: string;
  base64: string;
  mimeType: string;
}

interface ScanResult {
  title: string;
  author: string;
  publisher: string;
  publishedDate: string;
  description: string;
  coverImage?: string;
}

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
}

const DEFAULT_BOOKS: Book[] = [
  {
    id: 'demo-1',
    title: '데미안',
    author: '헤르만 헤세',
    publisher: '민음사',
    publishedDate: '2009-01-20',
    description: '싱클레어라는 소년이 신비로운 소년 데미안을 만나면서 자신의 내면의 소리에 귀 기울이고, 마침내 알을 깨고 나와 참된 자아를 찾아가는 치열한 성장 과정을 그린 철학적 고전 소설입니다.',
    addedAt: '2026-06-23'
  },
  {
    id: 'demo-2',
    title: '사피엔스',
    author: '유발 하라리',
    publisher: '김영사',
    publishedDate: '2015-11-24',
    description: '변방의 볼품없는 존재에 불과했던 인류의 조상 사피엔스가 어떻게 지구의 절대적인 지배자가 될 수 있었는지, 인류의 역사와 문명을 과학·철학적으로 풀어낸 글로벌 베스트셀러입니다.',
    addedAt: '2026-06-23'
  }
];

// Helper to filter out system file paths, screenshot names, or irrelevant text from extracted fields
const cleanExtractedText = (text: string): string => {
  if (!text) return '';
  const noiseRegex = /(\/var\/folders\/|\/tmp\/|Users\/|screencapture|screencaptureui|스크린샷|screenshot|[\w-]+\.(png|jpg|jpeg|gif|webp|pdf))/i;
  if (noiseRegex.test(text)) {
    return '';
  }
  return text.trim();
};

// High-speed image resizer using temporary Object URLs to avoid heavy memory allocation and main-thread blocks.
const resizeImage = (file: File): Promise<{ base64: string; preview: string }> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    
    image.onload = () => {
      const max_size = 1024;
      let width = image.width;
      let height = image.height;

      if (width > height) {
        if (width > max_size) {
          height *= max_size / width;
          width = max_size;
        }
      } else {
        if (height > max_size) {
          width *= max_size / height;
          height = max_size;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Canvas context not available'));
        return;
      }
      
      ctx.drawImage(image, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1];
      
      URL.revokeObjectURL(objectUrl);
      
      resolve({
        base64,
        preview: dataUrl
      });
    };

    image.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    image.src = objectUrl;
  });
};

function App() {
  // Navigation active tab
  const [activeTab, setActiveTab] = useState<'scan' | 'library'>('scan');

  // API Key loaded internally via Environment Variables or legacy local storage key (No UI setup input)
  const [apiKey] = useState<string>(() => {
    return import.meta.env.VITE_OPENROUTER_API_KEY || localStorage.getItem('inktrace_openrouter_key') || '';
  });
  
  const [books, setBooks] = useState<Book[]>(() => {
    const saved = localStorage.getItem('inktrace_books');
    return saved ? JSON.parse(saved) : DEFAULT_BOOKS;
  });

  const [image, setImage] = useState<ImageState | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notification, setNotification] = useState<Notification | null>(null);

  // Sync books to localStorage
  useEffect(() => {
    localStorage.setItem('inktrace_books', JSON.stringify(books));
  }, [books]);

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // Convert and resize File
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('이미지 파일만 업로드할 수 있습니다.', 'error');
      return;
    }

    setCompressing(true);
    try {
      const resized = await resizeImage(file);
      setImage({
        preview: resized.preview,
        base64: resized.base64,
        mimeType: 'image/jpeg'
      });
      setScanResult(null); // Clear previous scan results
    } catch (error) {
      console.error('Image compression error:', error);
      showToast('이미지 최적화 과정에서 오류가 발생했습니다.', 'error');
    } finally {
      setCompressing(false);
    }
  };

  // AI Image Recognition via OpenRouter API
  const handleScanImage = async () => {
    if (!apiKey) {
      showToast('서버 API 설정이 차단되어 있습니다. 환경 변수를 확인해 주세요.', 'error');
      return;
    }
    if (!image) {
      showToast('분석할 책의 표지 사진을 찍거나 올려주세요.', 'error');
      return;
    }

    setScanning(true);
    setProgress(20);

    try {
      setProgress(40);

      const prompt = `이 이미지는 책 표지 사진입니다. 이미지 분석을 통해 책의 정보를 추출해서 아래 JSON 스키마를 만족하는 JSON 형식으로 응답해 주세요. 마크다운 백틱 (\`\`\`json) 기호 없이 순수한 JSON 텍스트로만 응답해야 합니다. 한글 텍스트 추출에 최대한 정확성을 기해주세요.
      
      [필수 주의사항]
      1. 이미지 안에 책 표지가 아예 없거나, 책 정보가 아닌 맥북 시스템/화면 스크린샷 텍스트, 임시 파일 경로, 브라우저 스크린샷 잔상이 감지될 경우 해당 텍스트를 책 제목이나 정보로 추출하지 말고 반드시 빈 문자열("")로 반환해 주세요.
      2. 시스템 파일 경로나 스크린샷 파일 이름 패턴(예: /var/folders/..., .png, .jpg 등)이 도서 정보로 들어가지 않도록 철저히 가려주세요.
      
      JSON Schema:
      {
        "title": "책 제목 (정확하게 추출, 책 표지가 아니거나 모르면 빈 문자열)",
        "author": "저자 이름 (여러 명인 경우 쉼표로 연결, 모르면 빈 문자열)",
        "publisher": "출판사 이름 (모르면 빈 문자열)",
        "publishedDate": "출판 연도/날짜 (예: '2023', 모르면 빈 문자열)",
        "description": "책의 줄거리 혹은 핵심 내용 요약 (반드시 한국어로 정중하게 2~3문장, 책 표지가 아니면 빈 문자열)"
      }`;

      setProgress(60);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://0623agybookinfo.vercel.app",
          "X-Title": "InkTrace",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": "google/gemini-flash-1.5",
          "messages": [
            {
              "role": "user",
              "content": [
                {
                  "type": "text",
                  "text": prompt
                },
                {
                  "type": "image_url",
                  "image_url": {
                    "url": `data:${image.mimeType};base64,${image.base64}`
                  }
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API response error: ${response.status}`);
      }

      setProgress(85);
      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content?.trim();

      if (!responseText) {
        throw new Error('API returned empty content');
      }
      
      // Clean up markdown markers if any
      let jsonStr = responseText;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      
      // Double defense: filter out system paths on client-side
      const finalTitle = cleanExtractedText(parsed.title);
      const finalAuthor = cleanExtractedText(parsed.author);
      const finalPublisher = cleanExtractedText(parsed.publisher);
      
      setScanResult({
        title: finalTitle || '알 수 없는 제목',
        author: finalAuthor || '알 수 없는 저자',
        publisher: finalPublisher || '',
        publishedDate: parsed.publishedDate || '',
        description: parsed.description || '',
        coverImage: image.preview // Hold the scanned image preview
      });

      setProgress(100);
      showToast('책 표지 분석이 완료되었습니다. 내용을 확인하고 저장하세요!', 'success');
    } catch (error: any) {
      console.error('Scanning error:', error);
      showToast('분석 도중 오류가 발생했습니다. 이미지나 서버 설정을 확인해 주세요.', 'error');
      setProgress(0);
    } finally {
      setScanning(false);
    }
  };

  // Add analyzed book to library
  const handleSaveBook = () => {
    if (!scanResult || !scanResult.title.trim()) {
      showToast('저장할 책 정보가 입력되지 않았습니다.', 'error');
      return;
    }

    const newBook: Book = {
      id: `book-${Date.now()}`,
      title: scanResult.title,
      author: scanResult.author,
      publisher: scanResult.publisher,
      publishedDate: scanResult.publishedDate,
      description: scanResult.description,
      coverImage: scanResult.coverImage,
      addedAt: new Date().toLocaleDateString('ko-KR')
    };

    setBooks(prev => [newBook, ...prev]);
    
    // Clear scanning zone
    setImage(null);
    setScanResult(null);
    setProgress(0);

    showToast(`'${newBook.title}' 도서가 서재에 추가되었습니다.`, 'success');
    
    // Smooth navigation switch to Library
    setTimeout(() => {
      setActiveTab('library');
    }, 400);
  };

  // Delete Book
  const handleDeleteBook = (id: string, title: string) => {
    if (window.confirm(`'${title}' 도서를 서재에서 삭제하시겠습니까?`)) {
      setBooks(prev => prev.filter(b => b.id !== id));
      showToast('도서가 삭제되었습니다.', 'info');
    }
  };

  // Export library to JSON
  const handleExportLibrary = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(books, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `inktrace_library_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('도서 목록을 JSON 파일로 다운로드했습니다.', 'success');
    } catch (err) {
      showToast('백업을 내보내는 중 실패했습니다.', 'error');
    }
  };

  // Filter books based on search query
  const filteredBooks = books.filter(book => 
    book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.publisher.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Dynamic Cover Gradient Renderer (Fallback if no image provided)
  const BookCover = ({ title, src }: { title: string; src?: string }) => {
    if (src) {
      return <img src={src} className="book-card-cover" alt={title} />;
    }
    
    const gradients = [
      'linear-gradient(135deg, #a855f7, #ec4899)',
      'linear-gradient(135deg, #3b82f6, #06b6d4)',
      'linear-gradient(135deg, #10b981, #3b82f6)',
      'linear-gradient(135deg, #f59e0b, #ef4444)',
      'linear-gradient(135deg, #6366f1, #a855f7)'
    ];
    const charCode = title.charCodeAt(0) || 0;
    const gradient = gradients[charCode % gradients.length];

    return (
      <div className="book-card-cover" style={{ background: gradient }}>
        <span style={{ fontSize: '20px', fontWeight: '800', color: '#fff' }}>
          {title.charAt(0)}
        </span>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">
            <BookOpen size={20} color="#ffffff" />
          </div>
          <div>
            <h1 className="logo-text">InkTrace</h1>
            <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>AI 도서 정보 스캔 & 내 서재</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Bulky API Badge & Key settings button completely removed from Header */}
          <button className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '13px' }} onClick={handleExportLibrary} title="내보내기">
            <FileDown size={14} />
            <span className="hidden-xs">백업 다운로드</span>
          </button>
        </div>
      </header>

      {/* Segmented Tab Navigation */}
      <nav className="tab-navigation" aria-label="메인 메뉴">
        <button 
          className={`tab-button ${activeTab === 'scan' ? 'active' : ''}`}
          onClick={() => setActiveTab('scan')}
        >
          <Camera size={16} />
          <span>책 스캔하기</span>
        </button>
        <button 
          className={`tab-button ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          <BookMarked size={16} />
          <span>내 서재 보기 ({books.length})</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="tab-content" key={activeTab}>
        {activeTab === 'scan' ? (
          /* SCAN VIEW */
          <section className="panel" aria-label="책 스캔 및 정보 추출">
            {compressing ? (
              /* Image compression/optimization phase */
              <div className="scan-hero-zone">
                <RefreshCw size={36} className="spin-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--accent-primary)' }} />
                <p style={{ marginTop: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>모바일 사진 최적화 및 용량 압축 중...</p>
              </div>
            ) : !image ? (
              /* Initial First Screen: Large Camera Trigger or Upload */
              <div className="scan-hero-zone">
                <div className="scan-title-group">
                  <h2>책 사진 촬영하여 저장하기</h2>
                  <p>스마트폰 카메라로 책 표지를 직접 찍거나, 보관 중인 이미지 파일을 불러오세요. AI가 도서 정보를 완벽히 해독해 냅니다.</p>
                </div>

                <div className="action-buttons-group">
                  {/* Premium circular camera trigger button */}
                  <div className="camera-trigger-wrapper">
                    <label className="camera-trigger-label" htmlFor="camera-shoot-input">
                      <Camera size={36} />
                      <span>사진 촬영</span>
                    </label>
                    <input 
                      id="camera-shoot-input"
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      onChange={handleFileChange}
                      style={{ display: 'none' }} 
                    />
                  </div>

                  <div className="divider-text">또는</div>

                  {/* Existing Image Upload Option */}
                  <label className="file-upload-btn-label" htmlFor="file-select-input">
                    <UploadCloud size={16} />
                    <span>기존 이미지 올리기</span>
                  </label>
                  <input 
                    id="file-select-input"
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange}
                    style={{ display: 'none' }} 
                  />
                </div>
              </div>
            ) : (
              /* Image Uploaded: Show preview and scan controls */
              <div className="scan-preview-card">
                <h3 className="panel-title" style={{ width: '100%', borderBottom: 'none', paddingBottom: 0 }}>
                  <Check size={18} color="var(--accent-primary)" />
                  선택된 이미지 프리뷰
                </h3>
                
                <div className="preview-container">
                  <img src={image.preview} alt="Book cover preview" className="upload-preview" />
                  <button 
                    className="remove-preview-btn" 
                    onClick={() => { setImage(null); setScanResult(null); setProgress(0); }}
                    title="사진 지우기"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Scan Status & Trigger Button */}
                {!scanResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', alignItems: 'center' }}>
                    {scanning && (
                      <div className="scan-progress-box">
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <RefreshCw size={14} className="spin-icon" style={{ animation: 'spin 2s linear infinite' }} />
                            AI 분석 진행 중...
                          </span>
                          <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>{progress}%</span>
                        </div>
                        <div className="progress-bar-container">
                          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                    )}
                    <button 
                      className="btn btn-primary" 
                      onClick={handleScanImage} 
                      disabled={scanning}
                      style={{ width: '100%', maxWidth: '320px' }}
                    >
                      {scanning ? '분석하는 중...' : 'AI로 책 정보 추출하기'}
                    </button>
                  </div>
                )}

                {/* Scan Results Form for Modification */}
                {scanResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                    <h4 style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
                      <Check size={18} color="var(--success)" />
                      추출 결과 편집
                    </h4>

                    <div className="form-group">
                      <label htmlFor="scan-title">제목</label>
                      <input 
                        id="scan-title"
                        type="text" 
                        className="form-control"
                        value={scanResult.title}
                        onChange={(e) => setScanResult({...scanResult, title: e.target.value})}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="scan-author">저자</label>
                      <input 
                        id="scan-author"
                        type="text" 
                        className="form-control"
                        value={scanResult.author}
                        onChange={(e) => setScanResult({...scanResult, author: e.target.value})}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label htmlFor="scan-publisher">출판사</label>
                        <input 
                          id="scan-publisher"
                          type="text" 
                          className="form-control"
                          value={scanResult.publisher}
                          onChange={(e) => setScanResult({...scanResult, publisher: e.target.value})}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="scan-date">출판 연도/일자</label>
                        <input 
                          id="scan-date"
                          type="text" 
                          className="form-control"
                          placeholder="예: 2024"
                          value={scanResult.publishedDate}
                          onChange={(e) => setScanResult({...scanResult, publishedDate: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="scan-description">요약/설명</label>
                      <textarea 
                        id="scan-description"
                        className="form-control"
                        value={scanResult.description}
                        onChange={(e) => setScanResult({...scanResult, description: e.target.value})}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '6px' }}>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => { setScanResult(null); }}
                      >
                        재시도
                      </button>
                      <button 
                        className="btn btn-primary" 
                        onClick={handleSaveBook}
                      >
                        내 서재에 저장
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          /* LIBRARY VIEW */
          <section className="panel" aria-label="저장된 서재">
            <div className="library-filters-bar">
              <div className="search-wrapper">
                <Search size={16} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="책 이름, 저자 또는 출판사 검색..." 
                  className="form-control search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button 
                className="btn btn-primary" 
                style={{ padding: '10px 16px', fontSize: '13px' }}
                onClick={() => setActiveTab('scan')}
              >
                <Plus size={15} />
                <span>책 추가하기</span>
              </button>
            </div>

            {/* Book Card Grid */}
            <div className="library-grid">
              {filteredBooks.length > 0 ? (
                filteredBooks.map((book) => (
                  <article className="book-card" key={book.id}>
                    <div className="book-card-main">
                      <BookCover title={book.title} src={book.coverImage} />
                      <div className="book-info">
                        <h3 className="book-title" title={book.title}>{book.title}</h3>
                        <p className="book-author">{book.author}</p>
                        <p className="book-meta">
                          {book.publisher && `${book.publisher}`}
                          {book.publishedDate && ` · ${book.publishedDate}`}
                        </p>
                      </div>
                    </div>
                    
                    {book.description && (
                      <p className="book-desc">{book.description}</p>
                    )}

                    <div className="book-card-actions">
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        등록일: {book.addedAt}
                      </span>
                      <button 
                        className="delete-btn" 
                        onClick={() => handleDeleteBook(book.id, book.title)}
                        title="서재에서 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-library">
                  <div className="empty-library-icon">
                    <Info size={26} />
                  </div>
                  <div>
                    <p style={{ fontWeight: '600', fontSize: '15px' }}>등록된 도서가 없습니다</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {searchQuery ? '검색어와 일치하는 책이 없습니다.' : '첫 번째 책 사진을 업로드해 스캔을 시작해 보세요!'}
                    </p>
                  </div>
                  {!searchQuery && (
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setActiveTab('scan')}
                      style={{ marginTop: '10px' }}
                    >
                      <Camera size={14} />
                      <span>책 스캔하러 가기</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* API Key Modal is completely removed */}

      {/* Toast Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          <AlertCircle size={15} />
          <span style={{ fontSize: '13px', fontWeight: '500' }}>{notification.message}</span>
        </div>
      )}

      {/* Global CSS Inject for Rotating Loader */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 480px) {
          .hidden-xs {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
