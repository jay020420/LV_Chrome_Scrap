// 제품 추적 관리 유틸리티
class ProductTracker {
    constructor() {
      // 추적 상태 상수 정의
      this.STATUS = {
        ACTIVE: 'active',       // 정상 판매 중
        OUT_OF_STOCK: 'out_of_stock', // 품절
        REMOVED: 'removed',     // 사이트에서 제거됨
        UNKNOWN: 'unknown'      // 상태 불명
      };
    }
  
    // 제품 히스토리 초기화 (최초 실행 시)
    async initializeProductHistory() {
      const storage = await this.getStorage();
      
      if (!storage.productHistory) {
        await this.setStorage({ productHistory: {} });
        console.log('제품 히스토리 초기화 완료');
      }
    }
  
    // Storage 접근 헬퍼 함수
    getStorage() {
      return new Promise(resolve => {
        chrome.storage.local.get(['productHistory'], result => {
          resolve(result);
        });
      });
    }
  
    setStorage(data) {
      return new Promise(resolve => {
        chrome.storage.local.set(data, () => {
          resolve();
        });
      });
    }
  
    // 제품 URL로 제품 상태 확인
    async checkProductStatus(url) {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          cache: 'no-store',
          redirect: 'follow',
          headers: {
            'User-Agent': this.getRandomUserAgent()
          }
        });
  
        if (response.ok) {
          // 200 OK - 제품 페이지 존재
          return this.STATUS.ACTIVE;
        } else if (response.status === 404) {
          // 404 Not Found - 제품 제거됨
          return this.STATUS.REMOVED;
        } else if (response.redirected) {
          // 리다이렉트된 경우 - 대부분 제품이 사라짐
          const redirectUrl = response.url;
          if (redirectUrl.includes('/products/') && redirectUrl !== url) {
            // 다른 제품으로 리다이렉트
            return this.STATUS.ACTIVE;
          } else {
            // 카테고리나 홈페이지로 리다이렉트 - 제품 제거로 간주
            return this.STATUS.REMOVED;
          }
        } else {
          // 기타 HTTP 오류
          console.warn(`제품 상태 확인 중 HTTP 오류 ${response.status}: ${url}`);
          return this.STATUS.UNKNOWN;
        }
      } catch (error) {
        console.error('제품 상태 확인 중 오류 발생:', error);
        return this.STATUS.UNKNOWN;
      }
    }
  
    // 제품 정보 업데이트 (상태, 마지막 확인 시간)
    async updateProductInfo(product, status = null) {
      const { productHistory } = await this.getStorage();
      const now = new Date().toISOString();
      
      // 제품 URL 또는 모델 ID를 키로 사용
      const key = product.url || product.model;
      
      if (!key) {
        console.error('제품 키가 없습니다:', product);
        return;
      }
      
      // 새 제품 또는 기존 제품 정보 업데이트
      const existingProduct = productHistory[key] || {};
      const currentStatus = status || existingProduct.status || this.STATUS.UNKNOWN;
      
      // 이전 상태와 다른 경우 상태 변경 이력 기록
      let statusHistory = existingProduct.statusHistory || [];
      if (existingProduct.status !== currentStatus) {
        statusHistory.push({
          from: existingProduct.status || null,
          to: currentStatus,
          timestamp: now
        });
      }
      
      // 제품 정보 구성
      productHistory[key] = {
        ...existingProduct,
        ...product,
        status: currentStatus,
        lastChecked: now,
        statusHistory: statusHistory
      };
      
      // 스토리지에 저장
      await this.setStorage({ productHistory });
      console.log(`제품 정보 업데이트: ${key}, 상태: ${currentStatus}`);
      
      return productHistory[key];
    }
  
    // 삭제된 제품 목록 가져오기
    async getRemovedProducts() {
      const { productHistory } = await this.getStorage();
      
      const removedProducts = Object.values(productHistory).filter(product => 
        product.status === this.STATUS.REMOVED
      );
      
      return removedProducts;
    }
  
    // 특정 기간 내에 삭제된 제품 확인
    async getRecentlyRemovedProducts(days = 7) {
      const removedProducts = await this.getRemovedProducts();
      const now = new Date();
      const cutoffDate = new Date(now.setDate(now.getDate() - days));
      
      return removedProducts.filter(product => {
        // 가장 최근 상태 변경이 REMOVED로 바뀐 시점 찾기
        const removedChange = product.statusHistory &&
          product.statusHistory
            .slice()
            .reverse()
            .find(change => change.to === this.STATUS.REMOVED);
        
        if (removedChange) {
          const changeDate = new Date(removedChange.timestamp);
          return changeDate >= cutoffDate;
        }
        
        return false;
      });
    }
  
    // 상태 변경된 제품들 (품절→삭제, 정상→삭제 등) 가져오기
    async getStatusChangedProducts() {
      const { productHistory } = await this.getStorage();
      
      const changedProducts = Object.values(productHistory).filter(product => 
        product.statusHistory && product.statusHistory.length > 0
      );
      
      return changedProducts;
    }
  
    // 랜덤 유저 에이전트 생성
    getRandomUserAgent() {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
      ];
      
      const index = Math.floor(Math.random() * userAgents.length);
      return userAgents[index];
    }
  }
  
  // 전역으로 내보내기
  window.ProductTracker = ProductTracker;