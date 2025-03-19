// URL 기반 품절 상태 확인 유틸리티

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
            if (product.url && !this.urlList.includes(product.url)) {
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
            
            // 품절 여부 확인
            const isOutOfStock = this.isProductOutOfStock(html);
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
    
    // HTML에서 품절 여부 확인
    isProductOutOfStock(html) {
      try {
        // DOM 파싱을 위한 임시 요소 생성
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 문자열에서 직접 품절 관련 텍스트 검색
        const outOfStockIndicators = [
          '품절', '재고 없음', '현재 재고 없음', '일시 품절',
          'out of stock', 'sold out', 'currently unavailable'
        ];
        
        // HTML 텍스트 내에서 품절 표시 확인
        const htmlText = doc.body.innerText || html;
        const hasOutOfStockText = outOfStockIndicators.some(indicator => 
          htmlText.toLowerCase().includes(indicator.toLowerCase())
        );
        
        if (hasOutOfStockText) {
          return true;
        }
        
        // 특정 요소로 품절 확인
        const outOfStockSelectors = [
          '.lv-stock-availability__label',
          '.lv-product-availability',
          '.lv-product__purchase-button--disabled',
          '[data-oos="true"]',
          '.soldout',
          '.out-of-stock'
        ];
        
        const hasOutOfStockElement = outOfStockSelectors.some(selector => {
          return doc.querySelector(selector) !== null;
        });
        
        if (hasOutOfStockElement) {
          return true;
        }
        
        // 비활성화된 버튼 확인
        const purchaseButtons = doc.querySelectorAll('button[disabled], .disabled');
        const hasPurchaseButtonsDisabled = Array.from(purchaseButtons).some(button => {
          const buttonText = button.innerText.toLowerCase();
          return buttonText.includes('구매') || 
                 buttonText.includes('장바구니') || 
                 buttonText.includes('buy') || 
                 buttonText.includes('cart');
        });
        
        return hasPurchaseButtonsDisabled;
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
  
  // 글로벌 객체에 내보내기
  self.URLStockChecker = URLStockChecker;