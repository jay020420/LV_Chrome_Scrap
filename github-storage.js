// GitHub를 원격 DB로 사용하는 유틸리티 클래스

class GitHubStorage {
    constructor(options = {}) {
      this.options = {
        owner: options.owner || '',           // GitHub 계정명
        repo: options.repo || '',             // 저장소 이름
        path: options.path || 'urls.json',    // 파일 경로
        branch: options.branch || 'main',     // 브랜치
        token: options.token || '',           // 개인 액세스 토큰 (PAT)
        commitMessage: options.commitMessage || 'Update URL data', // 커밋 메시지
        cacheDuration: options.cacheDuration || 60 * 60 * 1000,   // 캐시 지속 시간 (1시간)
        maxRetries: options.maxRetries || 3,  // 최대 재시도 횟수
      };
      
      this.cache = {
        data: null,
        timestamp: 0,
        sha: null  // 파일의 SHA 해시 (업데이트 시 필요)
      };
    }
    
    // 설정 초기화 및 검증
    async init() {
      if (!this.options.owner || !this.options.repo || !this.options.token) {
        throw new Error('GitHub 저장소 정보와 토큰이 필요합니다.');
      }
      
      // 저장소 및 파일 존재 여부 확인
      try {
        await this.getFileContent(true); // 강제 새로고침
        console.log('GitHub 저장소 연결 성공');
        return true;
      } catch (error) {
        if (error.status === 404) {
          // 파일이 없는 경우 생성
          console.log('GitHub에 파일이 없습니다. 새 파일을 생성합니다.');
          await this.saveToGitHub({
            urls: [],
            lastUpdated: new Date().toISOString(),
            meta: {
              source: 'LV Extension',
              createdAt: new Date().toISOString()
            }
          });
          return true;
        } else {
          console.error('GitHub 저장소 연결 중 오류:', error);
          throw error;
        }
      }
    }
    
    // GitHub에서 데이터 가져오기
    async getFileContent(forceRefresh = false) {
      // 캐시 확인
      const now = Date.now();
      if (!forceRefresh && this.cache.data && (now - this.cache.timestamp < this.options.cacheDuration)) {
        console.log('캐시된 데이터를 사용합니다.');
        return this.cache.data;
      }
      
      // GitHub API 요청 헤더
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${this.options.token}`
      };
      
      // API URL 구성
      const apiUrl = `https://api.github.com/repos/${this.options.owner}/${this.options.repo}/contents/${this.options.path}?ref=${this.options.branch}`;
      
      // GitHub API 호출
      let response;
      let retries = 0;
      
      while (retries < this.options.maxRetries) {
        try {
          response = await fetch(apiUrl, { headers });
          
          if (response.ok) {
            break;
          } else if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
            // API 호출 한도 초과
            const resetTime = parseInt(response.headers.get('X-RateLimit-Reset')) * 1000;
            const waitTime = resetTime - Date.now();
            
            if (waitTime > 0) {
              console.log(`API 호출 한도를 초과했습니다. ${Math.ceil(waitTime / 1000)}초 대기 후 재시도합니다.`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          } else if (response.status === 404) {
            const error = new Error('파일을 찾을 수 없습니다.');
            error.status = 404;
            throw error;
          } else {
            console.error(`GitHub API 오류 (${response.status}): ${await response.text()}`);
            retries++;
            
            // 지수 백오프로 재시도 지연
            const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          if (error.status === 404) throw error;
          
          console.error('GitHub 데이터 요청 중 오류:', error);
          retries++;
          
          if (retries >= this.options.maxRetries) {
            throw new Error('최대 재시도 횟수를 초과했습니다.');
          }
          
          // 지수 백오프로 재시도 지연
          const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      const data = await response.json();
      
      // base64 디코딩
      const content = JSON.parse(atob(data.content));
      
      // 캐시 업데이트
      this.cache = {
        data: content,
        timestamp: now,
        sha: data.sha
      };
      
      return content;
    }
    
    // GitHub에 데이터 저장
    async saveToGitHub(data) {
      // 커밋할 파일 내용 준비
      const content = btoa(JSON.stringify(data, null, 2)); // JSON을 base64로 인코딩
      
      // API URL 구성
      const apiUrl = `https://api.github.com/repos/${this.options.owner}/${this.options.repo}/contents/${this.options.path}`;
      
      // 요청 본문 준비
      const requestBody = {
        message: this.options.commitMessage,
        content: content,
        branch: this.options.branch
      };
      
      // 이미 파일이 있다면 SHA 포함 (덮어쓰기 위함)
      if (this.cache.sha) {
        requestBody.sha = this.cache.sha;
      }
      
      // GitHub API 호출
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${this.options.token}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub 데이터 저장 중 오류 (${response.status}): ${errorText}`);
      }
      
      const responseData = await response.json();
      
      // 캐시 업데이트
      this.cache = {
        data: data,
        timestamp: Date.now(),
        sha: responseData.content.sha
      };
      
      console.log('GitHub에 데이터가 성공적으로 저장되었습니다.');
      return true;
    }
    
    // URL 목록 가져오기
    async getUrls() {
      const data = await this.getFileContent();
      return data.urls || [];
    }
    
    // URL 추가
    async addUrl(url, metadata = {}) {
      const data = await this.getFileContent();
      const urls = data.urls || [];
      
      // 중복 검사
      const existingIndex = urls.findIndex(item => item.url === url);
      
      if (existingIndex >= 0) {
        // 기존 항목 업데이트
        urls[existingIndex] = {
          ...urls[existingIndex],
          ...metadata,
          updatedAt: new Date().toISOString()
        };
      } else {
        // 새 항목 추가
        urls.push({
          url,
          ...metadata,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      // 데이터 저장
      data.urls = urls;
      data.lastUpdated = new Date().toISOString();
      data.totalCount = urls.length;
      
      await this.saveToGitHub(data);
      return urls;
    }
    
    // 여러 URL 한번에 추가/업데이트
    async addUrls(urlItems) {
      if (!Array.isArray(urlItems) || urlItems.length === 0) {
        return [];
      }
      
      const data = await this.getFileContent();
      const urls = data.urls || [];
      
      // 각 URL 항목 처리
      urlItems.forEach(item => {
        if (!item.url) return;
        
        const existingIndex = urls.findIndex(existing => existing.url === item.url);
        
        if (existingIndex >= 0) {
          // 기존 항목 업데이트
          urls[existingIndex] = {
            ...urls[existingIndex],
            ...item,
            updatedAt: new Date().toISOString()
          };
        } else {
          // 새 항목 추가
          urls.push({
            ...item,
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      });
      
      // 데이터 저장
      data.urls = urls;
      data.lastUpdated = new Date().toISOString();
      data.totalCount = urls.length;
      
      await this.saveToGitHub(data);
      return urls;
    }
    
    // URL 상태 업데이트
    async updateUrlStatus(url, status, metadata = {}) {
      const data = await this.getFileContent();
      const urls = data.urls || [];
      
      const existingIndex = urls.findIndex(item => item.url === url);
      
      if (existingIndex >= 0) {
        // 상태 이력 추가
        const currentStatus = urls[existingIndex].status;
        
        if (!urls[existingIndex].statusHistory) {
          urls[existingIndex].statusHistory = [];
        }
        
        if (currentStatus !== status) {
          urls[existingIndex].statusHistory.push({
            from: currentStatus,
            to: status,
            timestamp: new Date().toISOString()
          });
        }
        
        // 상태 및 메타데이터 업데이트
        urls[existingIndex] = {
          ...urls[existingIndex],
          ...metadata,
          status,
          updatedAt: new Date().toISOString()
        };
        
        // 데이터 저장
        data.urls = urls;
        data.lastUpdated = new Date().toISOString();
        
        await this.saveToGitHub(data);
        return urls[existingIndex];
      }
      
      return null;
    }
    
    // URL 검색
    async searchUrls(query = {}) {
      const data = await this.getFileContent();
      let urls = data.urls || [];
      
      // 검색 조건이 있는 경우 필터링
      if (Object.keys(query).length > 0) {
        urls = urls.filter(url => {
          return Object.entries(query).every(([key, value]) => {
            // 상태 검색
            if (key === 'status') {
              return url.status === value;
            }
            
            // 텍스트 검색 (부분 일치)
            if (typeof value === 'string' && typeof url[key] === 'string') {
              return url[key].toLowerCase().includes(value.toLowerCase());
            }
            
            // 정확히 일치
            return url[key] === value;
          });
        });
      }
      
      return urls;
    }
    
    // URL 삭제
    async removeUrl(url) {
      const data = await this.getFileContent();
      const urls = data.urls || [];
      
      const existingIndex = urls.findIndex(item => item.url === url);
      
      if (existingIndex >= 0) {
        urls.splice(existingIndex, 1);
        
        // 데이터 저장
        data.urls = urls;
        data.lastUpdated = new Date().toISOString();
        data.totalCount = urls.length;
        
        await this.saveToGitHub(data);
        return true;
      }
      
      return false;
    }
    
    // 로컬 데이터와 원격 데이터 동기화
    async syncWithLocalStorage() {
      try {
        // 원격 데이터 가져오기
        const remoteData = await this.getFileContent(true);
        const remoteUrls = remoteData.urls || [];
        
        // 로컬 데이터 가져오기
        const { products, outOfStockProducts, productHistory } = await new Promise(resolve => {
          chrome.storage.local.get(['products', 'outOfStockProducts', 'productHistory'], resolve);
        });
        
        const localUrls = [];
        
        // 제품 목록에서 URL 추출
        if (products && Array.isArray(products)) {
          products.forEach(product => {
            if (product.url) {
              localUrls.push({
                url: product.url,
                model: product.model,
                productName: product.productName,
                source: 'products',
                status: 'active'
              });
            }
          });
        }
        
        // 품절 상품에서 URL 추출
        if (outOfStockProducts && Array.isArray(outOfStockProducts)) {
          outOfStockProducts.forEach(product => {
            if (product.url && !localUrls.some(item => item.url === product.url)) {
              localUrls.push({
                url: product.url,
                model: product.model,
                productName: product.productName,
                source: 'outOfStockProducts',
                status: 'out_of_stock'
              });
            }
          });
        }
        
        // 제품 히스토리에서 URL 추출
        if (productHistory) {
          Object.values(productHistory).forEach(product => {
            if (product.url && !localUrls.some(item => item.url === product.url)) {
              localUrls.push({
                url: product.url,
                model: product.model,
                productName: product.productName,
                source: 'productHistory',
                status: product.status
              });
            }
          });
        }
        
        // 병합 전략:
        // 1. 로컬에 있지만 원격에 없는 URL 추가
        // 2. 양쪽에 모두 있는 URL은 더 최신 상태로 업데이트
        const urlsToAdd = [];
        
        localUrls.forEach(localUrl => {
          const remoteUrl = remoteUrls.find(remote => remote.url === localUrl.url);
          
          if (!remoteUrl) {
            // 원격에 없는 로컬 URL 추가
            urlsToAdd.push(localUrl);
          } else if (localUrl.status !== remoteUrl.status) {
            // 상태가 변경된 경우 업데이트
            this.updateUrlStatus(localUrl.url, localUrl.status, localUrl);
          }
        });
        
        // 새 URL 한번에 추가
        if (urlsToAdd.length > 0) {
          await this.addUrls(urlsToAdd);
          console.log(`${urlsToAdd.length}개의 URL을 GitHub에 추가했습니다.`);
        }
        
        // 동기화 결과
        return {
          addedUrls: urlsToAdd.length,
          totalUrls: remoteUrls.length + urlsToAdd.length
        };
      } catch (error) {
        console.error('GitHub 동기화 중 오류:', error);
        throw error;
      }
    }
    
    // GitHub에서 로컬 스토리지로 가져오기
    async importToLocalStorage() {
      try {
        // 원격 데이터 가져오기
        const remoteData = await this.getFileContent(true);
        const remoteUrls = remoteData.urls || [];
        
        if (remoteUrls.length === 0) {
          return { importedProducts: 0, importedOutOfStock: 0 };
        }
        
        // 로컬 데이터 가져오기
        const { products, outOfStockProducts } = await new Promise(resolve => {
          chrome.storage.local.get(['products', 'outOfStockProducts'], resolve);
        });
        
        const localProducts = products || [];
        const localOutOfStock = outOfStockProducts || [];
        
        let importedProducts = 0;
        let importedOutOfStock = 0;
        
        // 원격 URL을 로컬에 적절하게 추가
        remoteUrls.forEach(remoteUrl => {
          // 상태에 따라 다른 처리
          if (remoteUrl.status === 'out_of_stock') {
            // 품절 상품 목록에 추가
            if (!localOutOfStock.some(item => item.url === remoteUrl.url)) {
              localOutOfStock.push({
                url: remoteUrl.url,
                model: remoteUrl.model,
                productName: remoteUrl.productName,
                isOutOfStock: true,
                timestamp: new Date().toISOString()
              });
              importedOutOfStock++;
            }
          } else if (remoteUrl.status === 'active') {
            // 일반 제품 목록에 추가
            if (!localProducts.some(item => item.url === remoteUrl.url)) {
              localProducts.push({
                url: remoteUrl.url,
                model: remoteUrl.model,
                productName: remoteUrl.productName
              });
              importedProducts++;
            }
          }
        });
        
        // 로컬 스토리지에 저장
        if (importedProducts > 0) {
          await new Promise(resolve => {
            chrome.storage.local.set({ products: localProducts }, resolve);
          });
        }
        
        if (importedOutOfStock > 0) {
          await new Promise(resolve => {
            chrome.storage.local.set({ outOfStockProducts: localOutOfStock }, resolve);
          });
        }
        
        return { importedProducts, importedOutOfStock };
      } catch (error) {
        console.error('GitHub에서 가져오기 중 오류:', error);
        throw error;
      }
    }
  }
  
  // 전역으로 내보내기
  if (typeof window !== 'undefined') {
    window.GitHubStorage = GitHubStorage;
  }
  if (typeof self !== 'undefined') {
    self.GitHubStorage = GitHubStorage;
  }