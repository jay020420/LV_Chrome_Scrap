// 백그라운드 스크립트 (background.js)

// =============== URL 확인기 클래스 (직접 내장) ===============
class URLStockChecker {
  constructor() {
    this.urlList = []; // 확인할 URL 목록
    this.currentIndex = 0; // 현재 처리 중인 URL 인덱스
    this.isRunning = false; // 실행 상태
    this.results = {
      outOfStock: [],  // 품절 상품
      inStock: [],     // 재고 있는 상품
      error: [],       // 오류 발생한 URL
      removed: []      // 삭제된 상품
    };
    this.settings = {
      delayMin: 2,     // 최소 지연 시간(초)
      delayMax: 5,     // 최대 지연 시간(초)
      batchSize: 1,    // 동시 처리 URL 수(차단 방지를 위해 1로 설정)
      maxRetries: 2    // 오류 시 최대 재시도 횟수
    };
    
    // 콜백 함수
    this.callbacks = {
      onProgress: null,  // 진행 상황 업데이트 콜백
      onComplete: null,  // 완료 콜백
      onUrlChecked: null // URL 체크 완료 콜백
    };
  }
  
  // URL 목록 로드 및 초기화
  async init(type = 'all') {
    this.results = { outOfStock: [], inStock: [], error: [], removed: [] };
    this.currentIndex = 0;
    
    try {
      // 기존 저장된 데이터 로드
      const data = await new Promise(resolve => {
        chrome.storage.local.get(['products', 'outOfStockProducts', 'productHistory'], resolve);
      });
      
      // URL 목록 초기화
      this.urlList = [];
      
      if (type === 'all' || type === 'products') {
        // 일반 제품 목록에서 URL 추출
        const products = data.products || [];
        products.forEach(product => {
          if (product.url && !this.urlList.some(item => item.url === product.url)) {
            this.urlList.push({
              url: product.url,
              model: product.model,
              productName: product.productName,
              type: 'product'
            });
          }
        });
      }
      
      if (type === 'all' || type === 'outOfStock') {
        // 품절 제품 목록에서 URL 추출
        const outOfStockProducts = data.outOfStockProducts || [];
        outOfStockProducts.forEach(product => {
          if (product.url && !this.urlList.some(item => item.url === product.url)) {
            this.urlList.push({
              url: product.url,
              model: product.model,
              productName: product.productName,
              type: 'outOfStock'
            });
          }
        });
      }
      
      if (type === 'all' || type === 'history') {
        // 제품 히스토리에서 URL 추출
        const productHistory = data.productHistory || {};
        Object.values(productHistory).forEach(product => {
          if (product.url && !this.urlList.some(item => item.url === product.url)) {
            this.urlList.push({
              url: product.url,
              model: product.model,
              productName: product.productName,
              type: 'history',
              status: product.status
            });
          }
        });
      }
      
      console.log(`총 ${this.urlList.length}개의 URL을 로드했습니다.`);
      return this.urlList.length;
    } catch (error) {
      console.error('URL 목록 초기화 중 오류:', error);
      return 0;
    }
  }
  
  // 설정 업데이트
  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    return this.settings;
  }
  
  // 콜백 설정
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  
  // 품절 확인 시작
  async start() {
    if (this.isRunning) {
      console.warn('이미 실행 중입니다.');
      return false;
    }
    
    if (this.urlList.length === 0) {
      console.warn('확인할 URL이 없습니다.');
      return false;
    }
    
    this.isRunning = true;
    this.currentIndex = 0;
    this.notifyProgress();
    
    await this.processNextBatch();
    return true;
  }
  
  // 중지
  stop() {
    this.isRunning = false;
    console.log('품절 확인이 중지되었습니다.');
    return true;
  }
  
  // 일괄 처리
  async processNextBatch() {
    if (!this.isRunning) return;
    
    // 모든 URL 처리 완료 확인
    if (this.currentIndex >= this.urlList.length) {
      this.complete();
      return;
    }
    
    // 현재 배치 URL 가져오기
    const batchEnd = Math.min(this.currentIndex + this.settings.batchSize, this.urlList.length);
    const currentBatch = this.urlList.slice(this.currentIndex, batchEnd);
    
    // 배치 처리
    await Promise.all(currentBatch.map(item => this.checkUrl(item)));
    
    // 인덱스 업데이트
    this.currentIndex = batchEnd;
    
    // 진행 상황 알림
    this.notifyProgress();
    
    // 다음 배치 처리 전 지연
    if (this.isRunning && this.currentIndex < this.urlList.length) {
      const delay = this.getRandomDelay();
      await new Promise(resolve => setTimeout(resolve, delay));
      await this.processNextBatch();
    }
  }
  
  // 단일 URL 확인
  async checkUrl(item, retryCount = 0) {
    if (!this.isRunning) return;
    
    try {
      console.log(`URL 확인 중 (${this.currentIndex + 1}/${this.urlList.length}): ${item.url}`);
      
      // 1. fetch로 URL 상태 확인
      let status = '';
      let errorMessage = '';
      
      try {
        const response = await fetch(item.url, {
          method: 'GET',
          cache: 'no-store',
          redirect: 'follow'
        });
        
        if (response.ok) {
          // 페이지 내용을 가져와서 품절 여부 확인
          const html = await response.text();
          
          // 품절 여부 확인 (간단한 텍스트 검색 방식, Service Worker에서는 DOM 파싱 불가)
          const isOutOfStock = this.isProductOutOfStockSimple(html);
          status = isOutOfStock ? 'outOfStock' : 'inStock';
        } else if (response.status === 404) {
          status = 'removed';
        } else if (response.redirected) {
          const redirectUrl = response.url;
          if (redirectUrl.includes('/products/') && redirectUrl !== item.url) {
            // 다른 제품으로 리다이렉트
            status = 'inStock';
          } else {
            // 카테고리나 홈페이지로 리다이렉트 - 제품 제거로 간주
            status = 'removed';
          }
        } else {
          // 기타 HTTP 오류
          status = 'error';
          errorMessage = `HTTP 오류 ${response.status}`;
        }
      } catch (error) {
        status = 'error';
        errorMessage = error.message;
        
        // 재시도 로직
        if (retryCount < this.settings.maxRetries) {
          console.log(`URL 확인 실패, 재시도 중 (${retryCount + 1}/${this.settings.maxRetries})...`);
          const retryDelay = 1000 * (retryCount + 1); // 재시도마다 지연 시간 증가
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return this.checkUrl(item, retryCount + 1);
        }
      }
      
      // 2. 결과 저장
      const result = {
        ...item,
        checked: new Date().toISOString(),
        status
      };
      
      if (errorMessage) {
        result.errorMessage = errorMessage;
      }
      
      // 상태별 결과 분류
      this.results[status].push(result);
      
      // 콜백 호출
      if (this.callbacks.onUrlChecked) {
        this.callbacks.onUrlChecked(result);
      }
      
      // 결과에 따라 품절 상품 목록 업데이트
      if (status === 'outOfStock') {
        await this.updateOutOfStockProduct(item);
      }
      
      return result;
    } catch (error) {
      console.error(`URL 확인 중 오류 (${item.url}):`, error);
      
      const result = {
        ...item,
        checked: new Date().toISOString(),
        status: 'error',
        errorMessage: error.message
      };
      
      this.results.error.push(result);
      
      if (this.callbacks.onUrlChecked) {
        this.callbacks.onUrlChecked(result);
      }
      
      return result;
    }
  }
  
  // HTML에서 품절 여부 확인 (단순 텍스트 검색 - Service Worker 환경용)
  isProductOutOfStockSimple(html) {
    try {
      // 문자열에서 직접 품절 관련 텍스트 검색
      const outOfStockIndicators = [
        '품절', '재고 없음', '현재 재고 없음', '일시 품절',
        'out of stock', 'sold out', 'currently unavailable'
      ];
      
      // HTML 텍스트 내에서 품절 표시 확인
      const hasOutOfStockText = outOfStockIndicators.some(indicator => 
        html.toLowerCase().includes(indicator.toLowerCase())
      );
      
      return hasOutOfStockText;
    } catch (error) {
      console.error('품절 확인 중 오류:', error);
      return false; // 오류 발생 시 기본값 - 재고 있음으로 처리
    }
  }
  
  // 진행 상황 알림
  notifyProgress() {
    if (this.callbacks.onProgress) {
      const progress = {
        total: this.urlList.length,
        current: this.currentIndex,
        percentage: Math.round((this.currentIndex / this.urlList.length) * 100),
        results: {
          outOfStock: this.results.outOfStock.length,
          inStock: this.results.inStock.length,
          error: this.results.error.length,
          removed: this.results.removed.length
        }
      };
      
      this.callbacks.onProgress(progress);
    }
  }
  
  // 완료 처리
  complete() {
    this.isRunning = false;
    console.log('품절 확인이 완료되었습니다.');
    console.log('결과:', {
      total: this.urlList.length,
      outOfStock: this.results.outOfStock.length,
      inStock: this.results.inStock.length,
      error: this.results.error.length,
      removed: this.results.removed.length
    });
    
    if (this.callbacks.onComplete) {
      this.callbacks.onComplete(this.results);
    }
  }
  
  // 랜덤 지연 시간 생성
  getRandomDelay() {
    return Math.floor(Math.random() * 
      (this.settings.delayMax - this.settings.delayMin + 1) + 
      this.settings.delayMin) * 1000;
  }
  
  // 품절 상품 목록 업데이트
  async updateOutOfStockProduct(item) {
    try {
      // 기존 품절 상품 목록 가져오기
      const { outOfStockProducts } = await new Promise(resolve => {
        chrome.storage.local.get(['outOfStockProducts'], resolve);
      });
      
      const products = outOfStockProducts || [];
      
      // 이미 존재하는지 확인
      const existingIndex = products.findIndex(p => p.url === item.url);
      
      const productInfo = {
        url: item.url,
        model: item.model,
        productName: item.productName,
        isOutOfStock: true,
        timestamp: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        // 기존 정보 업데이트
        products[existingIndex] = {
          ...products[existingIndex],
          ...productInfo
        };
      } else {
        // 새 정보 추가
        products.push(productInfo);
      }
      
      // 저장
      await new Promise(resolve => {
        chrome.storage.local.set({ outOfStockProducts: products }, resolve);
      });
      
      return true;
    } catch (error) {
      console.error('품절 상품 업데이트 중 오류:', error);
      return false;
    }
  }
  
  // 현재 결과 가져오기
  getResults() {
    return this.results;
  }
}

// ============= 원래 background.js 코드 시작 =============

// 수집 상태 관리
let collectionStatus = {
  isCollecting: false,
  categoryUrl: '',
  currentPage: 1,
  maxPages: 5,
  delayMin: 2,
  delayMax: 5,
  productUrls: [],
  processedUrls: 0,
  progress: ''
};

// 추적 상태 관리
let trackingStatus = {
  autoTracking: true,
  trackingInterval: 24, // 시간 단위
  lastTracked: null,
  isTracking: false
};

// URL 확인기 상태
let urlCheckerStatus = {
  isRunning: false,
  urlChecker: null,
  results: null
};

// 차단 방지를 위한 사용자 에이전트 목록
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

// 임의 지연 시간 생성 함수
function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

// 임의 사용자 에이전트 선택 함수
function getRandomUserAgent() {
  const index = Math.floor(Math.random() * userAgents.length);
  return userAgents[index];
}

// 모든 팝업에 현재 진행 상태 알림
function broadcastProgress(progressText) {
  collectionStatus.progress = progressText;
  // 메시지 전송 (팝업이 열려있지 않을 수 있으므로 에러 처리 추가)
  try {
    chrome.runtime.sendMessage({ 
      action: 'updateCollectionProgress', 
      progressText: progressText 
    }, function(response) {
      // 응답 처리 (필요한 경우)
      // 런타임 에러는 여기서 캐치됨
      if (chrome.runtime.lastError) {
        console.log('메시지 전송 중 에러 (수신자가 없을 수 있음):', chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.log('진행 상태 업데이트 중 에러:', error);
  }
}

// 기존 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 이미지 다운로드 처리
  if (message.action === 'downloadImage') {
    // 이미지 다운로드 설정 확인
    chrome.storage.local.get(['downloadImages'], function(result) {
      // 기본값은 true (다운로드 활성화)
      const downloadImages = result.downloadImages === undefined ? true : result.downloadImages;
      
      // 다운로드 비활성화 상태면 처리 중단
      if (!downloadImages) {
        console.log('이미지 다운로드가 비활성화되어 있어 다운로드를 건너뜁니다:', message.filename);
        if (message.callback) message.callback({ skipped: true });
        return;
      }
      
      // 다운로드 진행
      const folderPath = `${message.productName}/${message.material}/${message.model}/`;
      const filenameWithPath = folderPath + message.filename;
      
      chrome.downloads.download({
        url: message.url,
        filename: filenameWithPath,
        conflictAction: 'uniquify',
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('다운로드 오류:', chrome.runtime.lastError);
        } else {
          console.log(`다운로드 시작 ID: ${downloadId}, 경로: ${filenameWithPath}`);
          
          if (message.isThumbnail) {
            const extension = filenameWithPath.split('.').pop();
            const thumbnailPath = `Thumbnail/${message.model}.${extension}`;
            
            chrome.downloads.download({
              url: message.url,
              filename: thumbnailPath,
              conflictAction: 'uniquify',
              saveAs: false
            }, (thumbId) => {
              if (chrome.runtime.lastError) {
                console.error('썸네일 다운로드 오류:', chrome.runtime.lastError);
              } else {
                console.log(`썸네일 다운로드 시작 ID: ${thumbId}, 경로: ${thumbnailPath}`);
              }
            });
          }
        }
      });
    });
  }
  // 데이터 수집 요청 처리
  else if (message.action === 'collectData') {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0) {
        return;
      }
      
      const tab = tabs[0];
      if (tab.url && tab.url.includes('louisvuitton.com')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-script.js']
        });
      } else {
        console.error('루이비통 웹사이트가 아닙니다:', tab.url);
        chrome.action.setPopup({ popup: 'popup.html' });
        alert('이 확장 프로그램은 루이비통 웹사이트에서만 사용할 수 있습니다.');
      }
    });
  }
  // 품절 상품 수집 시작
  else if (message.action === 'startOutOfStockCollection') {
    if (collectionStatus.isCollecting) {
      sendResponse({ success: false, message: '이미 수집이 진행 중입니다.' });
      return true;
    }
    
    // 수집 상태 초기화
    collectionStatus = {
      isCollecting: true,
      categoryUrl: message.categoryUrl,
      currentPage: 1,
      maxPages: message.maxPages || 5,
      delayMin: message.delayMin || 2,
      delayMax: message.delayMax || 5,
      productUrls: [],
      processedUrls: 0,
      progress: '준비 중...'
    };
    
    console.log('품절 상품 수집 시작:', collectionStatus);
    broadcastProgress('수집 시작 중...');
    
    // 카테고리 페이지 탐색 시작
    startCategoryPageCrawling();
    
    sendResponse({ success: true, message: '수집이 시작되었습니다.' });
    return true;
  }
  // 품절 상품 수집 중지
  else if (message.action === 'stopOutOfStockCollection') {
    collectionStatus.isCollecting = false;
    broadcastProgress('수집이 중지되었습니다.');
    sendResponse({ success: true, message: '수집이 중지되었습니다.' });
    return true;
  }
  // 수집 상태 요청
  else if (message.action === 'getCollectionStatus') {
    sendResponse(collectionStatus);
    return true;
  }
  // 지금 삭제된 상품 확인
  else if (message.action === 'checkRemovedProducts') {
    if (trackingStatus.isTracking) {
      sendResponse({ success: false, message: '이미 추적 중입니다.' });
      return true;
    }
    
    // 삭제된 상품 확인 시작
    startTrackingRemovedProducts();
    
    sendResponse({ success: true });
    return true;
  }
  // URL 확인기 시작
  else if (message.action === 'startUrlChecker') {
    if (urlCheckerStatus.isRunning) {
      sendResponse({ success: false, message: '이미 URL 확인이 진행 중입니다.' });
      return true;
    }
    
    // URL 확인기 초기화 및 시작
    initUrlChecker(message.settings)
      .then(urlCount => {
        if (urlCount > 0) {
          startUrlChecker();
          sendResponse({ success: true, urlCount });
        } else {
          sendResponse({ success: false, message: '확인할 URL이 없습니다.' });
        }
      })
      .catch(error => {
        console.error('URL 확인기 초기화 중 오류:', error);
        sendResponse({ success: false, message: error.message });
      });
    
    return true;
  }
  // URL 확인기 중지
  else if (message.action === 'stopUrlChecker') {
    if (urlCheckerStatus.isRunning && urlCheckerStatus.urlChecker) {
      urlCheckerStatus.urlChecker.stop();
      urlCheckerStatus.isRunning = false;
      
      sendResponse({ success: true, message: 'URL 확인이 중지되었습니다.' });
    } else {
      sendResponse({ success: false, message: '실행 중인 URL 확인기가 없습니다.' });
    }
    
    return true;
  }
  // URL 확인 결과 내보내기
  else if (message.action === 'exportUrlCheckerResults') {
    if (!urlCheckerStatus.results) {
      sendResponse({ success: false, message: '내보낼 결과가 없습니다.' });
      return true;
    }
    
    exportUrlCheckerResults(urlCheckerStatus.results)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('URL 확인 결과 내보내기 중 오류:', error);
        sendResponse({ success: false, message: error.message });
      });
    
    return true;
  }
  
  return true; // 비동기 응답을 위해 true 반환
});

// 카테고리 페이지 크롤링 시작
function startCategoryPageCrawling() {
  if (!collectionStatus.isCollecting) return;
  
  broadcastProgress(`카테고리 페이지 ${collectionStatus.currentPage} 수집 중...`);
  console.log(`카테고리 페이지 ${collectionStatus.currentPage} 수집 시작`);
  
  // 새 탭에서 카테고리 페이지 열기
  let pageUrl = collectionStatus.categoryUrl;
  
  // 페이지 번호 처리 (첫 페이지가 아닌 경우)
  if (collectionStatus.currentPage > 1) {
    // URL에 페이지 매개변수 추가 (루이비통 페이지네이션 형식 확인 필요)
    const separator = pageUrl.includes('?') ? '&' : '?';
    pageUrl += `${separator}page=${collectionStatus.currentPage}`;
  }
  
  chrome.tabs.create({ url: pageUrl, active: false }, function(tab) {
    const tabId = tab.id;
    
    // 페이지 로드 완료 대기
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // 페이지가 로드되면 제품 URL 추출 스크립트 실행
        setTimeout(() => {
          if (!collectionStatus.isCollecting) {
            chrome.tabs.remove(tabId);
            return;
          }
          
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: extractProductUrlsFromCategory
          }, (results) => {
            // 추출된 URL 처리
            if (results && results[0] && results[0].result) {
              const newUrls = results[0].result;
              collectionStatus.productUrls = [...collectionStatus.productUrls, ...newUrls];
              
              console.log(`카테고리 페이지 ${collectionStatus.currentPage}에서 ${newUrls.length}개 URL 추출 완료.`);
              broadcastProgress(`${collectionStatus.productUrls.length}개 제품 URL 발견됨`);
              
              // 탭 닫기
              chrome.tabs.remove(tabId);
              
              // 다음 페이지로 진행 또는 제품 상세 페이지 처리 시작
              if (collectionStatus.currentPage < collectionStatus.maxPages) {
                collectionStatus.currentPage++;
                
                // 다음 페이지 수집 전 임의 지연
                const delay = randomDelay(collectionStatus.delayMin, collectionStatus.delayMax);
                console.log(`다음 페이지 수집까지 ${delay/1000}초 대기`);
                
                setTimeout(() => {
                  startCategoryPageCrawling();
                }, delay);
              } else {
                console.log(`모든 카테고리 페이지 수집 완료. 총 ${collectionStatus.productUrls.length}개 URL 수집됨`);
                broadcastProgress(`총 ${collectionStatus.productUrls.length}개 URL 수집됨. 제품 페이지 분석 시작...`);
                
                // 모든 카테고리 페이지 처리 완료, 제품 상세 페이지 처리 시작
                processProductPages();
              }
            } else {
              console.error('URL 추출 실패');
              broadcastProgress('URL 추출 중 오류 발생');
              
              // 탭 닫기
              chrome.tabs.remove(tabId);
              
              // 다음 페이지로 진행 또는 종료
              if (collectionStatus.currentPage < collectionStatus.maxPages) {
                collectionStatus.currentPage++;
                
                // 다음 페이지 수집 전 임의 지연
                const delay = randomDelay(collectionStatus.delayMin, collectionStatus.delayMax);
                
                setTimeout(() => {
                  startCategoryPageCrawling();
                }, delay);
              } else {
                processProductPages();
              }
            }
          });
        }, 2000); // 페이지 로드 후 추가 대기
      }
    });
  });
}

// 카테고리 페이지에서 제품 URL 추출 함수 (브라우저 컨텍스트에서 실행)
function extractProductUrlsFromCategory() {
  try {
    console.log('카테고리 페이지에서 제품 링크 추출 시작');
    
    // 제품 링크 요소 선택자 (실제 루이비통 웹사이트 구조에 맞게 조정 필요)
    const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'));
    
    // 페이지 제목에서 카테고리 정보 추출
    const pageTitle = document.title || '';
    
    console.log(`${productLinks.length}개의 제품 링크 요소 발견`);
    
    // URL 중복 제거를 위한 Set
    const uniqueUrls = new Set();
    
    // 각 링크에서 URL 추출
    productLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.includes('/products/')) {
        // 상대 URL을 절대 URL로 변환
        const absoluteUrl = new URL(href, window.location.origin).href;
        uniqueUrls.add(absoluteUrl);
      }
    });
    
    // Set을 배열로 변환
    const productUrls = Array.from(uniqueUrls);
    console.log(`중복 제거 후 ${productUrls.length}개 URL 추출 완료`);
    
    return productUrls;
  } catch (error) {
    console.error('제품 URL 추출 중 오류 발생:', error);
    return [];
  }
}

// 제품 페이지 처리 함수
function processProductPages() {
  if (!collectionStatus.isCollecting || collectionStatus.productUrls.length === 0) {
    finishCollection();
    return;
  }
  
  // 이미 처리한 URL 수
  const processed = collectionStatus.processedUrls;
  const total = collectionStatus.productUrls.length;
  
  // 모든 URL 처리 완료 확인
  if (processed >= total) {
    finishCollection();
    return;
  }
  
  // 다음 URL 처리
  const nextUrl = collectionStatus.productUrls[processed];
  collectionStatus.processedUrls++;
  
  broadcastProgress(`제품 페이지 확인 중 (${processed + 1}/${total}): ${nextUrl}`);
  console.log(`제품 페이지 처리 중 (${processed + 1}/${total}): ${nextUrl}`);
  
  // 새 탭에서 제품 페이지 열기
  chrome.tabs.create({ url: nextUrl, active: false }, function(tab) {
    const tabId = tab.id;
    
    // 페이지 로드 완료 대기
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // 페이지가 로드되면 품절 상태 확인 스크립트 실행
        setTimeout(() => {
          if (!collectionStatus.isCollecting) {
            chrome.tabs.remove(tabId);
            return;
          }
          
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: checkProductAvailability
          }, (results) => {
            // 제품 정보 처리
            if (results && results[0] && results[0].result) {
              const productInfo = results[0].result;
              
              if (productInfo.isOutOfStock) {
                console.log('품절 상품 발견:', productInfo.productName);
                
                // 품절 상품 저장
                chrome.storage.local.get(['outOfStockProducts'], function(result) {
                  const outOfStockProducts = result.outOfStockProducts || [];
                  
                  // 이미 있는 제품인지 확인
                  const existingIndex = outOfStockProducts.findIndex(p => p.url === productInfo.url);
                  
                  if (existingIndex >= 0) {
                    // 기존 데이터 업데이트
                    outOfStockProducts[existingIndex] = productInfo;
                    console.log('기존 품절 상품 데이터 업데이트:', productInfo);
                  } else {
                    // 새 데이터 추가
                    outOfStockProducts.push(productInfo);
                    console.log('새 품절 상품 데이터 추가:', productInfo);
                  }
                  
                  chrome.storage.local.set({ outOfStockProducts }, () => {
                    console.log('품절 상품 데이터 저장 완료. 총 품절 상품 수:', outOfStockProducts.length);
                    broadcastProgress(`품절 상품 발견: ${productInfo.productName} (총 ${outOfStockProducts.length}개)`);
                  });
                });
              } else {
                console.log('재고 있음:', productInfo.productName);
              }
            } else {
              console.error('제품 정보 추출 실패');
            }
            
            // 탭 닫기
            chrome.tabs.remove(tabId);
            
            // 다음 제품 페이지 처리 전 임의 지연
            const delay = randomDelay(collectionStatus.delayMin, collectionStatus.delayMax);
            console.log(`다음 제품 페이지 처리까지 ${delay/1000}초 대기`);
            
            setTimeout(() => {
              processProductPages();
            }, delay);
          });
        }, 2000); // 페이지 로드 후 추가 대기
      }
    });
  });
}

// 제품 페이지에서 품절 여부 확인 함수 (브라우저 컨텍스트에서 실행)
function checkProductAvailability() {
  try {
    console.log('제품 페이지 분석 시작');
    
    // 제품 정보 추출
    const modelElement = document.querySelector('.lv-product__sku.overline');
    const model = modelElement ? modelElement.textContent.trim().replace(/<!---->/g, '') : '';
    
    const productNameElement = document.querySelector('.lv-product__name');
    const productName = productNameElement ? productNameElement.textContent.trim() : '';
    
    const priceElement = document.querySelector('.notranslate');
    const price = priceElement ? priceElement.textContent.trim() : '';
    
    // 페이지 제목에서 카테고리 추출
    const pageTitle = document.title || '';
    const category = pageTitle.split('|').length > 1 ? pageTitle.split('|')[0].trim() : '';
    
    // 품절 여부 확인 방법 1: 품절 텍스트 검색
    const pageText = document.body.innerText;
    const outOfStockKeywords = [
      '품절', '재고 없음', '현재 재고 없음', '일시 품절', 
      'out of stock', 'sold out', 'currently unavailable'
    ];
    const hasOutOfStockText = outOfStockKeywords.some(keyword => 
      pageText.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // 품절 여부 확인 방법 2: 품절 버튼/요소 확인
    const disabledButtons = Array.from(document.querySelectorAll('button[disabled], .disabled, .out-of-stock'));
    const hasDisabledButton = disabledButtons.some(button => {
      const buttonText = button.innerText.toLowerCase();
      return buttonText.includes('구매') || buttonText.includes('장바구니') || 
             buttonText.includes('buy') || buttonText.includes('cart');
    });
    
    // 품절 여부 확인 방법 3: 색상 선택기 확인
    let outOfStockColorOptions = 0;
    let totalColorOptions = 0;
    
    try {
      const colorOptions = document.querySelectorAll('.lv-product-variation-selector-with-preview__option');
      totalColorOptions = colorOptions.length;
      
      colorOptions.forEach(option => {
        const isDisabled = option.getAttribute('aria-disabled') === 'true' || 
                           option.classList.contains('disabled');
        const altText = option.querySelector('img')?.getAttribute('alt') || '';
        const isOutOfStock = isDisabled || altText.includes('현재 재고 없음');
        
        if (isOutOfStock) {
          outOfStockColorOptions++;
        }
      });
    } catch (error) {
      console.error('색상 옵션 확인 중 오류:', error);
    }
    
    // 모든 색상이 품절인지 확인
    const allColorsOutOfStock = totalColorOptions > 0 && outOfStockColorOptions === totalColorOptions;
    
    // 종합적인 품절 판단
    const isOutOfStock = hasOutOfStockText || hasDisabledButton || allColorsOutOfStock;
    
    // 품절 이유 설명
    let outOfStockReason = '';
    if (isOutOfStock) {
      if (hasOutOfStockText) outOfStockReason += '품절 텍스트 발견. ';
      if (hasDisabledButton) outOfStockReason += '비활성화된 구매 버튼 발견. ';
      if (allColorsOutOfStock) outOfStockReason += `모든 색상 품절 (${outOfStockColorOptions}/${totalColorOptions}). `;
    }
    
    console.log('제품 분석 결과:', {
      model,
      productName,
      isOutOfStock,
      outOfStockReason
    });
    
    return {
      url: window.location.href,
      model,
      productName,
      category,
      price,
      isOutOfStock,
      outOfStockReason,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('제품 가용성 확인 중 오류 발생:', error);
    return {
      url: window.location.href,
      isOutOfStock: false,
      error: error.toString()
    };
  }
}

// 수집 완료 처리
function finishCollection() {
  if (!collectionStatus.isCollecting) return;
  
  // 수집 상태 업데이트
  collectionStatus.isCollecting = false;
  
  chrome.storage.local.get(['outOfStockProducts'], function(result) {
    const outOfStockProducts = result.outOfStockProducts || [];
    broadcastProgress(`수집 완료! 총 ${outOfStockProducts.length}개의 품절 상품 발견`);
    console.log('품절 상품 수집 완료');
  });
}

// fetch를 사용하여 제품 페이지 상태 확인
async function checkProductAvailabilityWithFetch(url) {
  try {
    // 기본 옵션으로 요청 - User-Agent를 설정하지 않음
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      cache: 'no-store'
    });
    
    if (response.ok) {
      // 200 응답이면 제품 페이지 존재
      return 'active';
    } else if (response.status === 404) {
      // 404면 제품 삭제됨
      return 'removed';
    } else if (response.redirected) {
      // 리다이렉트된 경우
      const redirectUrl = response.url;
      if (redirectUrl.includes('/products/') && redirectUrl !== url) {
        // 다른 제품으로 리다이렉트
        return 'active';
      } else {
        // 카테고리나 홈페이지로 리다이렉트 - 제품 제거로 간주
        return 'removed';
      }
    } else {
      // 기타 HTTP 오류
      console.warn(`HTTP 오류 ${response.status}: ${url}`);
      return 'unknown';
    }
  } catch (error) {
    console.error('fetch 요청 오류:', error);
    return 'unknown';
  }
}

// URL 확인기 초기화
async function initUrlChecker(settings) {
  try {
    // URL 확인기 객체 생성
    urlCheckerStatus.urlChecker = new URLStockChecker();
    
    // URL 목록 초기화
    const urlCount = await urlCheckerStatus.urlChecker.init(settings.urlSource || 'all');
    
    // 설정 업데이트
    urlCheckerStatus.urlChecker.updateSettings({
      delayMin: settings.delayMin || 3,
      delayMax: settings.delayMax || 7,
      maxRetries: settings.maxRetries || 2,
      batchSize: 1 // 차단 방지를 위해 1로 고정
    });
    
    // 콜백 설정
    urlCheckerStatus.urlChecker.setCallbacks({
      onProgress: (progress) => {
        try {
          // 진행 상황 알림
          chrome.runtime.sendMessage({ 
            action: 'updateUrlCheckerProgress',
            progress
          });
        } catch (error) {
          console.log('진행 상황 업데이트 중 오류:', error);
        }
      },
      onUrlChecked: (result) => {
        try {
          // URL 확인 결과 알림
          chrome.runtime.sendMessage({
            action: 'urlChecked',
            result
          });
        } catch (error) {
          console.log('URL 확인 결과 알림 중 오류:', error);
        }
      },
      onComplete: (results) => {
        try {
          // 완료 알림
          urlCheckerStatus.results = results;
          urlCheckerStatus.isRunning = false;
          
          chrome.runtime.sendMessage({
            action: 'urlCheckerCompleted',
            results
          });
        } catch (error) {
          console.log('URL 확인 완료 알림 중 오류:', error);
        }
      }
    });
    
    return urlCount;
  } catch (error) {
    console.error('URL 확인기 초기화 중 오류:', error);
    throw error;
  }
}

// URL 확인 시작
function startUrlChecker() {
  if (!urlCheckerStatus.urlChecker) {
    console.error('URL 확인기가 초기화되지 않았습니다.');
    return false;
  }
  
  urlCheckerStatus.isRunning = true;
  urlCheckerStatus.urlChecker.start();
  return true;
}

// URL 확인 결과 내보내기
async function exportUrlCheckerResults(results) {
  try {
    if (!results) {
      throw new Error('내보낼 결과가 없습니다.');
    }
    
    // 현재 날짜 포맷팅
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    
    // CSV 헤더 (BOM 추가로 한글 인코딩 보장)
    let csvContent = "\uFEFF모델ID,상품명,URL,상태,확인시간\n";
    
    // 모든 결과 합치기
    const allResults = [
      ...results.outOfStock,
      ...results.inStock,
      ...results.removed,
      ...results.error
    ];
    
    // 각 결과를 CSV 행으로 변환
    allResults.forEach(result => {
      const model = result.model || '';
      const productName = result.productName || '';
      const url = result.url || '';
      
      // 상태 텍스트 변환
      let status = '';
      switch (result.status) {
        case 'outOfStock': status = '품절'; break;
        case 'inStock': status = '재고 있음'; break;
        case 'removed': status = '삭제됨'; break;
        case 'error': status = '오류'; break;
        default: status = '알 수 없음';
      }
      
      // 시간 포맷팅
      const checkedDate = new Date(result.checked);
      const checkedStr = `${checkedDate.getFullYear()}-${String(checkedDate.getMonth() + 1).padStart(2, '0')}-${String(checkedDate.getDate()).padStart(2, '0')} ${String(checkedDate.getHours()).padStart(2, '0')}:${String(checkedDate.getMinutes()).padStart(2, '0')}`;
      
      // CSV 행 추가
      csvContent += `"${model}","${productName}","${url}","${status}","${checkedStr}"\n`;
    });
    
    // Blob 생성 및 다운로드
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: objectUrl,
      filename: `LouisVuitton_URL_Check_${dateStr}_${timeStr}.csv`,
      conflictAction: 'uniquify',
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('CSV 다운로드 오류:', chrome.runtime.lastError);
        throw new Error('CSV 파일 다운로드 중 오류가 발생했습니다.');
      } else {
        console.log(`CSV 다운로드 시작 ID: ${downloadId}`);
      }
    });
    
    return true;
  } catch (error) {
    console.error('URL 확인 결과 내보내기 중 오류:', error);
    throw error;
  }
}

// 삭제된 상품 추적 시작
async function startTrackingRemovedProducts() {
  // 이미 추적 중이면 중복 실행 방지
  if (trackingStatus.isTracking) {
    console.log('이미 추적 중입니다.');
    return;
  }
  
  trackingStatus.isTracking = true;
  console.log('삭제된 상품 추적 시작');
  
  try {
    // 기존 상품 목록 가져오기
    const { productHistory, outOfStockProducts } = await new Promise(resolve => {
      chrome.storage.local.get(['productHistory', 'outOfStockProducts'], resolve);
    });
    
    // 제품 히스토리 초기화
    const productsToTrack = {};
    
    // 1. 기존 제품 히스토리에서 가져오기
    if (productHistory) {
      Object.entries(productHistory).forEach(([key, product]) => {
        // URL이 있는 제품만 추적
        if (product.url) {
          productsToTrack[key] = product;
        }
      });
    }
    
    // 2. 품절 상품에서 가져오기
    if (outOfStockProducts && outOfStockProducts.length > 0) {
      outOfStockProducts.forEach(product => {
        if (product.url) {
          const key = product.url || product.model;
          if (key && !productsToTrack[key]) {
            productsToTrack[key] = {
              ...product,
              status: 'out_of_stock',
              lastChecked: new Date().toISOString()
            };
          }
        }
      });
    }
    
    const trackableProducts = Object.values(productsToTrack);
    console.log(`추적할 제품 ${trackableProducts.length}개 발견`);
    
    // 추적기 메서드 초기화 - 이제 executeTrackerScript()는 호출할 필요 없음
    // 직접 필요한 상수와 함수 사용
    const STATUS = {
      ACTIVE: 'active',
      OUT_OF_STOCK: 'out_of_stock',
      REMOVED: 'removed',
      UNKNOWN: 'unknown'
    };
    
    // 추적할 제품이 없으면 완료
    if (trackableProducts.length === 0) {
      finishTracking();
      return;
    }
    
    // 각 제품의 상태 확인 - 배치 처리 (한 번에 5개씩)
    const batchSize = 5;
    const totalBatches = Math.ceil(trackableProducts.length / batchSize);
    
    // 원하는 작업 차단을 방지하기 위해 각 배치 간 지연 시간 설정
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // 현재 배치의 제품들
      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min((batchIndex + 1) * batchSize, trackableProducts.length);
      const batch = trackableProducts.slice(batchStart, batchEnd);
      
      console.log(`배치 ${batchIndex + 1}/${totalBatches} 처리 중 (${batch.length}개 제품)`);
      
      // 각 제품의 상태를 병렬로 확인
      await Promise.all(batch.map(async (product) => {
        // 새 탭에서 제품 페이지 열기 대신 헤더만 확인
        try {
          // 페이지 상태 확인
          const status = await checkProductAvailabilityWithFetch(product.url);
          
          // 제품 정보 업데이트
          await updateProductStatus(product, status);
          
          console.log(`${product.url} - 상태: ${status}`);
        } catch (error) {
          console.error(`${product.url} 확인 중 오류:`, error);
        }
      }));
      
      // 배치 간 지연 (1~3초)
      if (batchIndex < totalBatches - 1) {
        const delay = Math.floor(Math.random() * 2000) + 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    finishTracking();
  } catch (error) {
    console.error('삭제된 상품 추적 중 오류 발생:', error);
    finishTracking();
  }
}

// 제품 상태 업데이트
async function updateProductStatus(product, status) {
  const { productHistory } = await new Promise(resolve => {
    chrome.storage.local.get(['productHistory'], resolve);
  });
  
  // 제품 키 (URL 또는 모델 ID)
  const key = product.url || product.model;
  if (!key) return;
  
  const now = new Date().toISOString();
  const existingProduct = productHistory[key] || {};
  const currentStatus = existingProduct.status || 'unknown';
  
  // 상태가 변경된 경우 상태 변경 이력 추가
  let statusHistory = existingProduct.statusHistory || [];
  if (currentStatus !== status) {
    statusHistory.push({
      from: currentStatus,
      to: status,
      timestamp: now
    });
    
    console.log(`상태 변경: ${key} - ${currentStatus} → ${status}`);
  }
  
  // 제품 정보 업데이트
  productHistory[key] = {
    ...existingProduct,
    ...product,
    status,
    lastChecked: now,
    statusHistory
  };
  
  // 저장
  await new Promise(resolve => {
    chrome.storage.local.set({ productHistory }, resolve);
  });
  
  // 팝업 업데이트
  chrome.runtime.sendMessage({ 
    action: 'updateRemovedProducts'
  });
}

// 추적 완료 처리
function finishTracking() {
  // 마지막 추적 시간 업데이트
  const now = new Date().toISOString();
  trackingStatus.lastTracked = now;
  trackingStatus.isTracking = false;
  
  // 설정 저장
  chrome.storage.local.set({ lastTracked: now }, function() {
    console.log('추적 완료. 마지막 추적 시간 업데이트:', now);
    
    // 다음 추적 일정 설정
    if (trackingStatus.autoTracking) {
      scheduleNextTracking();
    }
  });
}

// 다음 추적 일정 설정
function scheduleNextTracking() {
  // 이미 추적 중이면 중복 실행 방지
  if (trackingStatus.isTracking) {
    return;
  }
  
  const now = new Date();
  let nextTrackingTime;
  
  if (trackingStatus.lastTracked) {
    // 마지막 추적 시간에 추적 주기를 더한 시간
    const lastTracked = new Date(trackingStatus.lastTracked);
    nextTrackingTime = new Date(lastTracked.getTime() + (trackingStatus.trackingInterval * 60 * 60 * 1000));
    
    // 이미 지난 시간이면 지금 실행
    if (nextTrackingTime <= now) {
      console.log('이전 추적 시간이 지났습니다. 지금 추적 시작...');
      startTrackingRemovedProducts();
      return;
    }
  } else {
    // 마지막 추적 기록이 없으면 첫 실행을 1분 뒤로 설정
    nextTrackingTime = new Date(now.getTime() + (1 * 60 * 1000));
  }
  
  // 다음 추적 시간까지의 대기 시간 (밀리초)
  const delayMs = nextTrackingTime.getTime() - now.getTime();
  console.log(`다음 추적 ${Math.round(delayMs / (1000 * 60))}분 후 (${nextTrackingTime.toLocaleString()})에 실행 예정`);
  
  // 알람 API 사용 또는 setTimeout 사용
  setTimeout(() => {
    if (trackingStatus.autoTracking) {
      startTrackingRemovedProducts();
    }
  }, delayMs);
}

// 제품 추적 초기화
function initializeTracking() {
  // 저장된 추적 설정 불러오기
  chrome.storage.local.get(['autoTracking', 'trackingInterval', 'lastTracked'], function(result) {
    trackingStatus.autoTracking = result.autoTracking === undefined ? true : result.autoTracking;
    trackingStatus.trackingInterval = result.trackingInterval || 24;
    trackingStatus.lastTracked = result.lastTracked || null;
    
    console.log('추적 설정 로드:', trackingStatus);
    
    // 제품 히스토리 초기화
    chrome.storage.local.get(['productHistory'], async function(result) {
      if (!result.productHistory) {
        await chrome.storage.local.set({ productHistory: {} });
        console.log('제품 히스토리 초기화 완료');
      }
      
      // 자동 추적이 활성화되어 있으면 추적 일정 설정
      if (trackingStatus.autoTracking) {
        scheduleNextTracking();
      }
    });
  });
}

// URL 확인기 스크립트는 직접 내장됨 (URLStockChecker 클래스)

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setPopup({ popup: 'popup.html' });
  
  // 제품 추적 초기화
  initializeTracking();
  
  console.log('확장 프로그램이 설치/업데이트되었습니다.');
});