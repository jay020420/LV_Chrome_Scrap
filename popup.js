// 스토리지 변경 시 카운트 업데이트
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.products) {
    updateProductCount();
  }
  if (changes.outOfStockProducts) {
    updateOutOfStockCount();
  }
  if (changes.productHistory) {
    updateRemovedProductsCount();
  }
});

// 백그라운드 메시지 리스너 추가
chrome.runtime.onMessage.addListener(function(message) {
  if (message.action === 'updateCollectionProgress') {
    const progressStatus = document.getElementById('progressStatus');
    if (progressStatus) {
      progressStatus.textContent = message.progressText;
      progressStatus.style.display = 'block';
    }
  } else if (message.action === 'updateRemovedProducts') {
    // 삭제된 상품 업데이트 메시지 처리
    try {
      updateRemovedProductsCount();
    } catch (error) {
      console.log('삭제된 상품 업데이트 중 에러:', error);
    }
  } else if (message.action === 'updateUrlCheckerProgress') {
    // URL 확인기 진행 상황 업데이트
    try {
      updateUrlCheckerProgress(message.progress);
    } catch (error) {
      console.log('URL 확인기 진행 상황 업데이트 중 에러:', error);
    }
  } else if (message.action === 'urlChecked') {
    // URL 확인 결과 추가
    try {
      addUrlCheckerResult(message.result);
    } catch (error) {
      console.log('URL 확인 결과 추가 중 에러:', error);
    }
  } else if (message.action === 'urlCheckerCompleted') {
    // URL 확인 완료
    try {
      urlCheckerCompleted(message.results);
    } catch (error) {
      console.log('URL 확인 완료 처리 중 에러:', error);
    }
  }
});

// 팝업 스크립트 (popup.js)
document.addEventListener('DOMContentLoaded', function() {
  // 탭 기능 초기화
  const tabButtons = document.querySelectorAll('.tablinks');
  if (tabButtons) {
    tabButtons.forEach(button => {
      button.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');
        if (tabName) {
          openTab(this, tabName);
        }
      });
    });
  }
  
  // 탭 전환 함수
  function openTab(clickedTab, tabName) {
    try {
      // 모든 탭 내용 숨기기
      const tabcontent = document.getElementsByClassName('tabcontent');
      for (let i = 0; i < tabcontent.length; i++) {
        if (tabcontent[i]) {
          tabcontent[i].style.display = 'none';
        }
      }
      
      // 모든 탭 버튼에서 활성 클래스 제거
      const tablinks = document.getElementsByClassName('tablinks');
      for (let i = 0; i < tablinks.length; i++) {
        if (tablinks[i]) {
          tablinks[i].className = tablinks[i].className.replace(' active', '');
        }
      }
      
      // 선택된 탭 내용 표시 및 버튼 활성화
      const selectedTab = document.getElementById(tabName);
      if (selectedTab) {
        selectedTab.style.display = 'block';
      }
      
      if (clickedTab) {
        clickedTab.className += ' active';
      }
    } catch (error) {
      console.error('탭 전환 중 오류 발생:', error);
    }
  }
  
  // 이미지 다운로드 토글 초기화
  initImageDownloadToggle();
  
  // 제품 정보 탭 기능
  updateProductCount();
  
  document.getElementById('collectData').addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'collectData' });
    
    const statusDiv = document.createElement('div');
    statusDiv.textContent = '데이터 수집 중...';
    statusDiv.style.padding = '10px';
    statusDiv.style.marginTop = '10px';
    statusDiv.style.backgroundColor = '#FFF9C4';
    statusDiv.style.borderRadius = '4px';
    statusDiv.style.textAlign = 'center';
    
    const existingStatus = document.getElementById('statusMessage');
    if (existingStatus) {
      existingStatus.remove();
    }
    
    statusDiv.id = 'statusMessage';
    document.body.appendChild(statusDiv);
    
    setTimeout(() => window.close(), 1000);
  });
  
  document.getElementById('exportExcel').addEventListener('click', exportToExcel);
  
  document.getElementById('clearData').addEventListener('click', function() {
    if (confirm('저장된 모든 제품 데이터를 삭제하시겠습니까?')) {
      chrome.storage.local.set({ products: [] }, function() {
        updateProductCount();
        alert('모든 제품 데이터가 삭제되었습니다.');
      });
    }
  });
  
  // 품절 상품 탭 기능
  updateOutOfStockCount();
  
  document.getElementById('collectOutOfStock').addEventListener('click', function() {
    const categoryUrl = document.getElementById('categoryUrl').value;
    const maxPages = parseInt(document.getElementById('maxPages').value) || 5;
    const delayMin = parseInt(document.getElementById('delayMin').value) || 2;
    const delayMax = parseInt(document.getElementById('delayMax').value) || 5;
    
    if (!categoryUrl || !categoryUrl.includes('louisvuitton.com')) {
      alert('유효한 루이비통 카테고리 URL을 입력해주세요.');
      return;
    }
    
    // 수집 설정 저장
    chrome.storage.local.set({
      collectionSettings: {
        categoryUrl,
        maxPages,
        delayMin,
        delayMax
      }
    });
    
    // 진행 상태 표시
    const progressStatus = document.getElementById('progressStatus');
    progressStatus.textContent = '수집 준비 중...';
    progressStatus.style.display = 'block';
    
    // 백그라운드 스크립트에 수집 시작 알림
    chrome.runtime.sendMessage({ 
      action: 'startOutOfStockCollection',
      categoryUrl,
      maxPages,
      delayMin,
      delayMax
    });
  });
  
  document.getElementById('stopCollection').addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'stopOutOfStockCollection' });
    
    const progressStatus = document.getElementById('progressStatus');
    progressStatus.textContent = '수집이 중지되었습니다.';
    progressStatus.style.backgroundColor = '#FFCDD2';
  });
  
  document.getElementById('exportOutOfStock').addEventListener('click', exportOutOfStockToExcel);
  
  document.getElementById('clearOutOfStock').addEventListener('click', function() {
    if (confirm('저장된 모든 품절 상품 데이터를 삭제하시겠습니까?')) {
      chrome.storage.local.set({ outOfStockProducts: [] }, function() {
        updateOutOfStockCount();
        alert('모든 품절 상품 데이터가 삭제되었습니다.');
      });
    }
  });
  
  // 삭제된 상품 탭 기능
  initRemovedProductsTab();
  
  // URL 확인기 탭 기능
  initUrlCheckerTab();
  
  // GitHub 동기화 탭 기능
  initGitHubSyncTab();
  
  // 자동 동기화 설정
  setupAutoSync();
  
  // 저장된 설정 불러오기
  chrome.storage.local.get(['collectionSettings'], function(result) {
    if (result.collectionSettings) {
      document.getElementById('categoryUrl').value = result.collectionSettings.categoryUrl || '';
      document.getElementById('maxPages').value = result.collectionSettings.maxPages || 5;
      document.getElementById('delayMin').value = result.collectionSettings.delayMin || 2;
      document.getElementById('delayMax').value = result.collectionSettings.delayMax || 5;
    }
  });
  
  // 수집 상태 확인 및 UI 업데이트
  chrome.runtime.sendMessage({ action: 'getCollectionStatus' }, function(response) {
    if (response && response.isCollecting) {
      const progressStatus = document.getElementById('progressStatus');
      progressStatus.textContent = `수집 중... (${response.progress || '준비 중'})`;
      progressStatus.style.display = 'block';
    }
  });
});

// 저장된 제품 수 업데이트
function updateProductCount() {
  chrome.storage.local.get(['products'], function(result) {
    const products = result.products || [];
    const productCount = document.getElementById('productCount');
    
    if (productCount) {
      productCount.textContent = `저장된 제품: ${products.length}개`;
      
      const productListDiv = document.getElementById('productList');
      if (productListDiv) {
        productListDiv.innerHTML = '';
        
        if (products.length === 0) {
          productListDiv.innerHTML = '<div style="padding: 5px;">저장된 제품이 없습니다.</div>';
        } else {
          products.forEach((product, index) => {
            const item = document.createElement('div');
            item.style.padding = '5px';
            item.style.borderBottom = '1px solid #eee';
            item.textContent = `${index + 1}. ${product.model}: ${product.productName}`;
            productListDiv.appendChild(item);
          });
        }
      }
    }
  });
}

// 품절 상품 수 업데이트
function updateOutOfStockCount() {
  chrome.storage.local.get(['outOfStockProducts'], function(result) {
    const products = result.outOfStockProducts || [];
    const outOfStockCount = document.getElementById('outOfStockCount');
    
    if (outOfStockCount) {
      outOfStockCount.textContent = `품절 상품: ${products.length}개`;
      
      const outOfStockListDiv = document.getElementById('outOfStockList');
      if (outOfStockListDiv) {
        outOfStockListDiv.innerHTML = '';
        
        if (products.length === 0) {
          outOfStockListDiv.innerHTML = '<div style="padding: 5px;">저장된 품절 상품이 없습니다.</div>';
        } else {
          products.forEach((product, index) => {
            const item = document.createElement('div');
            item.style.padding = '5px';
            item.style.borderBottom = '1px solid #eee';
            item.textContent = `${index + 1}. ${product.model || '모델명 없음'}: ${product.productName || '상품명 없음'}`;
            item.title = product.url || '';
            outOfStockListDiv.appendChild(item);
          });
        }
      }
    }
  });
}

// 엑셀로 내보내기
function exportToExcel() {
  chrome.storage.local.get(['products'], function(result) {
    const products = result.products || [];
    
    if (products.length === 0) {
      alert('내보낼 제품 데이터가 없습니다.');
      return;
    }
    
    // CSV 형식으로 변환 (BOM 추가로 한글 인코딩 보장)
    let csvContent = "\uFEFF모델ID,상품명,가격,색상,소재,설명이미지,썸네일이미지\n";
    
    products.forEach(product => {
      const descriptionImage = product.descriptionImage || '';
      const material = product.material || '';
      
      let thumbnailPath = '';
      if (product.images && product.images.length > 0) {
        const modelId = product.model;
        const extension = product.images[0].split('.').pop();
        thumbnailPath = `Thumbnail/${modelId}.${extension}`;
      }
      
      csvContent += `"${product.model}","${product.productName}","${product.price}","${product.color}","${material}","${descriptionImage}","${thumbnailPath}"\n`;
    });
    
    // CSV 파일 다운로드
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', `LouisVuitton_Products_${formattedDate}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`${products.length}개 제품 데이터가 성공적으로 내보내기 되었습니다!`);
  });
}

// 품절 상품 엑셀로 내보내기
function exportOutOfStockToExcel() {
  chrome.storage.local.get(['outOfStockProducts'], function(result) {
    const products = result.outOfStockProducts || [];
    
    if (products.length === 0) {
      alert('내보낼 품절 상품 데이터가 없습니다.');
      return;
    }
    
    // CSV 형식으로 변환 (BOM 추가로 한글 인코딩 보장)
    let csvContent = "\uFEFF모델ID,상품명,카테고리,가격,URL,수집일시\n";
    
    products.forEach(product => {
      const model = product.model || '';
      const productName = product.productName || '';
      const category = product.category || '';
      const price = product.price || '';
      const url = product.url || '';
      const timestamp = product.timestamp || new Date().toISOString();
      
      csvContent += `"${model}","${productName}","${category}","${price}","${url}","${timestamp}"\n`;
    });
    
    // CSV 파일 다운로드
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', `LouisVuitton_OutOfStock_${formattedDate}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`${products.length}개 품절 상품 데이터가 성공적으로 내보내기 되었습니다!`);
  });
}

// 이미지 다운로드 토글 초기화 및 이벤트 연결
function initImageDownloadToggle() {
  const toggle = document.getElementById('imageDownloadToggle');
  const status = document.getElementById('toggleStatus');
  
  // 저장된 설정 불러오기
  chrome.storage.local.get(['downloadImages'], function(result) {
    // 기본값은 true (켜짐)
    const downloadImages = result.downloadImages === undefined ? true : result.downloadImages;
    
    // 토글 상태 설정
    toggle.checked = downloadImages;
    status.textContent = downloadImages ? '켜짐' : '꺼짐';
    
    // 변경 이벤트 리스너 추가
    toggle.addEventListener('change', function() {
      const isChecked = this.checked;
      status.textContent = isChecked ? '켜짐' : '꺼짐';
      
      // 설정 저장
      chrome.storage.local.set({ downloadImages: isChecked }, function() {
        console.log('이미지 다운로드 설정 변경:', isChecked);
      });
    });
  });
}

// 삭제된 상품 탭 초기화 및 이벤트 리스너 설정
function initRemovedProductsTab() {
  updateRemovedProductsCount();
  
  // 자동 추적 토글 초기화
  const trackingToggle = document.getElementById('autoTrackingToggle');
  const trackingStatus = document.getElementById('trackingStatus');
  
  // 저장된 설정 불러오기
  chrome.storage.local.get(['autoTracking', 'trackingInterval', 'periodDays'], function(result) {
    // 기본값은 true (켜짐)
    const autoTracking = result.autoTracking === undefined ? true : result.autoTracking;
    trackingToggle.checked = autoTracking;
    trackingStatus.textContent = autoTracking ? '켜짐' : '꺼짐';
    
    // 추적 주기 설정
    if (result.trackingInterval) {
      document.getElementById('trackingInterval').value = result.trackingInterval;
    }
    
    // 표시 기간 설정
    if (result.periodDays) {
      document.getElementById('periodDays').value = result.periodDays;
    }
  });
  
  // 자동 추적 토글 이벤트 리스너
  trackingToggle.addEventListener('change', function() {
    const isChecked = this.checked;
    trackingStatus.textContent = isChecked ? '켜짐' : '꺼짐';
    
    // 설정 저장
    chrome.storage.local.set({ autoTracking: isChecked }, function() {
      console.log('자동 추적 설정 변경:', isChecked);
      // 백그라운드에 알림
      chrome.runtime.sendMessage({ 
        action: 'setAutoTracking', 
        enabled: isChecked 
      });
    });
  });
  
  // 추적 주기 변경 이벤트 리스너
  document.getElementById('trackingInterval').addEventListener('change', function() {
    const interval = parseInt(this.value) || 24;
    
    chrome.storage.local.set({ trackingInterval: interval }, function() {
      console.log('추적 주기 설정 변경:', interval);
      // 백그라운드에 알림
      chrome.runtime.sendMessage({ 
        action: 'setTrackingInterval', 
        interval: interval 
      });
    });
  });
  
  // 표시 기간 변경 이벤트 리스너
  document.getElementById('periodDays').addEventListener('change', function() {
    const days = parseInt(this.value) || 30;
    
    chrome.storage.local.set({ periodDays: days }, function() {
      console.log('표시 기간 설정 변경:', days);
      updateRemovedProductsCount(); // 변경된 기간으로 목록 업데이트
    });
  });
  
  // 삭제된 상품 확인 버튼 이벤트 리스너
  document.getElementById('checkRemovedProducts').addEventListener('click', function() {
    this.disabled = true;
    this.textContent = '확인 중...';
    
    chrome.runtime.sendMessage({ action: 'checkRemovedProducts' }, function(response) {
      const button = document.getElementById('checkRemovedProducts');
      button.disabled = false;
      button.textContent = '지금 삭제된 상품 확인';
      
      if (response && response.success) {
        updateRemovedProductsCount();
      } else {
        alert('삭제된 상품 확인 중 오류가 발생했습니다.');
      }
    });
  });
  
  // 삭제된 상품 내보내기 버튼 이벤트 리스너
  document.getElementById('exportRemoved').addEventListener('click', exportRemovedProductsToExcel);
  
  // 상태 변경 기록 보기 버튼 이벤트 리스너
  document.getElementById('viewStatusHistory').addEventListener('click', function() {
    chrome.tabs.create({ url: 'status-history.html' });
  });
}

// 삭제된 상품 수 및 목록 업데이트
function updateRemovedProductsCount() {
  chrome.storage.local.get(['productHistory', 'periodDays'], function(result) {
    const productHistory = result.productHistory || {};
    const periodDays = result.periodDays || 30;
    
    // 삭제된 상품 필터링
    const removedProducts = Object.values(productHistory).filter(product => 
      product.status === 'removed'
    );
    
    // 특정 기간 내 삭제된 상품만 필터링
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - periodDays);
    
    const recentlyRemoved = removedProducts.filter(product => {
      // 마지막 확인 시간 또는 상태 변경 시간 확인
      let dateToCheck;
      
      if (product.statusHistory && product.statusHistory.length > 0) {
        // 가장 최근의 'removed' 상태로 변경된 기록 찾기
        const removedChange = product.statusHistory
          .slice()
          .reverse()
          .find(change => change.to === 'removed');
        
        if (removedChange) {
          dateToCheck = new Date(removedChange.timestamp);
        } else {
          dateToCheck = new Date(product.lastChecked || now);
        }
      } else {
        dateToCheck = new Date(product.lastChecked || now);
      }
      
      return dateToCheck >= cutoffDate;
    });
    
    // 카운트 업데이트
    const removedCount = document.getElementById('removedCount');
    if (removedCount) {
      removedCount.textContent = `삭제된 상품: ${recentlyRemoved.length}개 (최근 ${periodDays}일)`;
    }
    
    // 목록 업데이트
    const removedListDiv = document.getElementById('removedList');
    if (removedListDiv) {
      removedListDiv.innerHTML = '';
      
      if (recentlyRemoved.length === 0) {
        removedListDiv.innerHTML = '<div style="padding: 10px;">최근 삭제된 상품이 없습니다.</div>';
      } else {
        // 날짜 기준으로 정렬 (최신순)
        recentlyRemoved.sort((a, b) => {
          const dateA = new Date(a.lastChecked || 0);
          const dateB = new Date(b.lastChecked || 0);
          return dateB - dateA;
        });
        
        recentlyRemoved.forEach((product, index) => {
          const item = document.createElement('div');
          item.className = 'product-item';
          
          // 상태 변경 일시 찾기
          let statusChangeDate = '날짜 정보 없음';
          let statusReason = '';
          
          if (product.statusHistory && product.statusHistory.length > 0) {
            const lastChange = product.statusHistory[product.statusHistory.length - 1];
            if (lastChange) {
              const date = new Date(lastChange.timestamp);
              statusChangeDate = formatDate(date);
              statusReason = `${lastChange.from || 'unknown'} → ${lastChange.to}`;
            }
          } else if (product.lastChecked) {
            const date = new Date(product.lastChecked);
            statusChangeDate = formatDate(date);
          }
          
          // 제품 정보 구성
          const modelText = product.model ? `${product.model}` : '모델명 없음';
          const nameText = product.productName ? `${product.productName}` : '상품명 없음';
          const urlText = product.url || '#';
          
          item.innerHTML = `
            <div class="product-item-header">
              <span class="product-item-title">${index + 1}. ${modelText}: ${nameText}</span>
              <span class="product-item-status status-removed">삭제됨</span>
            </div>
            <div class="product-item-date">감지 일시: ${statusChangeDate} ${statusReason ? `(${statusReason})` : ''}</div>
            <div class="product-item-link">${urlText}</div>
          `;
          
          // URL 클릭 이벤트
          item.querySelector('.product-item-link').addEventListener('click', function(e) {
            e.preventDefault();
            if (urlText && urlText !== '#') {
              chrome.tabs.create({ url: urlText });
            }
          });
          
          removedListDiv.appendChild(item);
        });
      }
    }
  });
}

// 날짜 포맷팅 헬퍼 함수
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    return '날짜 정보 없음';
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 삭제된 상품 내보내기
function exportRemovedProductsToExcel() {
  chrome.storage.local.get(['productHistory', 'periodDays'], function(result) {
    const productHistory = result.productHistory || {};
    const periodDays = result.periodDays || 30;
    
    // 삭제된 상품 필터링
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - periodDays);
    
    const removedProducts = Object.values(productHistory)
      .filter(product => product.status === 'removed')
      .filter(product => {
        // 마지막 확인 시간 확인
        const lastChecked = new Date(product.lastChecked || now);
        return lastChecked >= cutoffDate;
      });
    
    if (removedProducts.length === 0) {
      alert('내보낼 삭제된 상품 데이터가 없습니다.');
      return;
    }
    
    // CSV 형식으로 변환 (BOM 추가로 한글 인코딩 보장)
    let csvContent = "\uFEFF모델ID,상품명,카테고리,가격,삭제 감지일,마지막 상태,URL\n";
    
    removedProducts.forEach(product => {
      const model = product.model || '';
      const productName = product.productName || '';
      const category = product.category || '';
      const price = product.price || '';
      const url = product.url || '';
      
      // 상태 변경 날짜 찾기
      let statusChangeDate = product.lastChecked || '';
      let lastStatus = '';
      
      if (product.statusHistory && product.statusHistory.length > 0) {
        const lastChange = product.statusHistory[product.statusHistory.length - 1];
        if (lastChange) {
          statusChangeDate = lastChange.timestamp;
          lastStatus = `${lastChange.from || ''} → ${lastChange.to}`;
        }
      }
      
      csvContent += `"${model}","${productName}","${category}","${price}","${statusChangeDate}","${lastStatus}","${url}"\n`;
    });
    
    // CSV 파일 다운로드
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', `LouisVuitton_RemovedProducts_${formattedDate}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`${removedProducts.length}개 삭제된 상품 데이터가 성공적으로 내보내기 되었습니다!`);
  });
}

// URL 확인기 탭 초기화
function initUrlCheckerTab() {
  // URL 확인기 설정 불러오기
  chrome.storage.local.get(['urlCheckerSettings'], function(result) {
    const settings = result.urlCheckerSettings || {};
    
    // 설정 값 채우기
    if (document.getElementById('urlSourceSelect')) {
      document.getElementById('urlSourceSelect').value = settings.urlSource || 'all';
    }
    if (document.getElementById('urlCheckerDelayMin')) {
      document.getElementById('urlCheckerDelayMin').value = settings.delayMin || 3;
    }
    if (document.getElementById('urlCheckerDelayMax')) {
      document.getElementById('urlCheckerDelayMax').value = settings.delayMax || 7;
    }
    if (document.getElementById('maxRetries')) {
      document.getElementById('maxRetries').value = settings.maxRetries || 2;
    }
  });
  
  // URL 확인 시작 버튼
  const startUrlCheckerBtn = document.getElementById('startUrlChecker');
  if (startUrlCheckerBtn) {
    startUrlCheckerBtn.addEventListener('click', function() {
      const settings = {
        urlSource: document.getElementById('urlSourceSelect').value,
        delayMin: parseInt(document.getElementById('urlCheckerDelayMin').value) || 3,
        delayMax: parseInt(document.getElementById('urlCheckerDelayMax').value) || 7,
        maxRetries: parseInt(document.getElementById('maxRetries').value) || 2
      };
      
      // 설정 저장
      chrome.storage.local.set({ urlCheckerSettings: settings });
      
      // 결과 영역 초기화
      const resultsDiv = document.getElementById('urlCheckerResults');
      if (resultsDiv) {
        resultsDiv.innerHTML = '<div class="message">URL 확인 중...</div>';
      }
      
      // 진행 표시 영역 초기화
      if (document.getElementById('urlProgressText')) {
        document.getElementById('urlProgressText').textContent = '0 / 0 URL 확인됨 (0%)';
      }
      if (document.getElementById('urlStatusStats')) {
        document.getElementById('urlStatusStats').textContent = '발견된 품절 상품: 0';
      }
      if (document.getElementById('urlProgressBar')) {
        document.getElementById('urlProgressBar').style.width = '0%';
      }
      
      // 버튼 상태 변경
      this.disabled = true;
      const stopBtn = document.getElementById('stopUrlChecker');
      if (stopBtn) {
        stopBtn.disabled = false;
      }
      
      // 백그라운드에 URL 확인 시작 요청
      chrome.runtime.sendMessage({ 
        action: 'startUrlChecker',
        settings: settings
      }, function(response) {
        if (response && response.success) {
          console.log(`URL 확인 시작: ${response.urlCount}개의 URL`);
        } else {
          alert(response ? response.message : 'URL 확인 시작 중 오류가 발생했습니다.');
          if (startUrlCheckerBtn) {
            startUrlCheckerBtn.disabled = false;
          }
          if (stopBtn) {
            stopBtn.disabled = true;
          }
        }
      });
    });
  }
  
  // URL 확인 중지 버튼
  const stopUrlCheckerBtn = document.getElementById('stopUrlChecker');
  if (stopUrlCheckerBtn) {
    stopUrlCheckerBtn.addEventListener('click', function() {
      chrome.runtime.sendMessage({ action: 'stopUrlChecker' }, function(response) {
        // 버튼 상태 변경
        const startBtn = document.getElementById('startUrlChecker');
        if (startBtn) {
          startBtn.disabled = false;
        }
        if (stopUrlCheckerBtn) {
          stopUrlCheckerBtn.disabled = true;
        }
        
        if (response && response.success) {
          const resultsDiv = document.getElementById('urlCheckerResults');
          if (resultsDiv) {
            resultsDiv.innerHTML += '<div class="message" style="color: #FF9800;">URL 확인이 중지되었습니다.</div>';
          }
        }
      });
    });
  }
  
  // 결과 내보내기 버튼
  const exportUrlResultsBtn = document.getElementById('exportUrlResults');
  if (exportUrlResultsBtn) {
    exportUrlResultsBtn.addEventListener('click', function() {
      chrome.runtime.sendMessage({ action: 'exportUrlCheckerResults' }, function(response) {
        if (response && response.success) {
          console.log('URL 확인 결과 내보내기 성공');
        } else {
          alert(response ? response.message : 'URL 확인 결과 내보내기 중 오류가 발생했습니다.');
        }
      });
    });
  }
}

// URL 확인기 진행 상황 업데이트
function updateUrlCheckerProgress(progress) {
  const percentage = progress.percentage || 0;
  
  if (document.getElementById('urlProgressText')) {
    document.getElementById('urlProgressText').textContent = 
      `${progress.current} / ${progress.total} URL 확인됨 (${percentage}%)`;
  }
  
  if (document.getElementById('urlProgressBar')) {
    document.getElementById('urlProgressBar').style.width = `${percentage}%`;
  }
  
  // 상태별 통계 업데이트
  const results = progress.results || { outOfStock: 0, inStock: 0, error: 0, removed: 0 };
  
  if (document.getElementById('urlStatusStats')) {
    document.getElementById('urlStatusStats').textContent = 
      `품절: ${results.outOfStock}, 재고: ${results.inStock}, 삭제: ${results.removed}, 오류: ${results.error}`;
  }
}

// URL 확인 결과 추가
function addUrlCheckerResult(result) {
  const resultsDiv = document.getElementById('urlCheckerResults');
  if (!resultsDiv) return;
  
  // 첫 번째 결과인 경우 영역 비우기
  if (resultsDiv.querySelector('.message')) {
    resultsDiv.innerHTML = '';
  }
  
  // 결과 항목 생성
  const resultItem = document.createElement('div');
  resultItem.className = 'result-item';
  resultItem.style.padding = '5px';
  resultItem.style.borderBottom = '1px solid #eee';
  resultItem.style.fontSize = '12px';
  
  // 상태에 따른 스타일
  let statusText = '';
  let statusColor = '';
  
  switch (result.status) {
    case 'outOfStock':
      statusText = '품절';
      statusColor = '#FF9800';
      break;
    case 'inStock':
      statusText = '재고 있음';
      statusColor = '#4CAF50';
      break;
    case 'removed':
      statusText = '삭제됨';
      statusColor = '#F44336';
      break;
    case 'error':
      statusText = '오류';
      statusColor = '#9E9E9E';
      break;
    default:
      statusText = '알 수 없음';
      statusColor = '#9E9E9E';
  }
  
  // 결과 내용 설정
  const modelName = result.model || '';
  const productName = result.productName || '';
  const url = result.url || '';
  
  resultItem.innerHTML = `
    <div style="display: flex; justify-content: space-between;">
      <span>${modelName}: ${productName}</span>
      <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
    </div>
    <div style="font-size: 11px; color: #666; overflow: hidden; text-overflow: ellipsis;">
      ${url}
    </div>
  `;
  
  // 결과 영역에 추가
  resultsDiv.prepend(resultItem);
}

// URL 확인 완료 처리
function urlCheckerCompleted(results) {
  // 버튼 상태 변경
  const startBtn = document.getElementById('startUrlChecker');
  const stopBtn = document.getElementById('stopUrlChecker');
  
  if (startBtn) {
    startBtn.disabled = false;
  }
  
  if (stopBtn) {
    stopBtn.disabled = true;
  }
  
  // 결과 요약
  const resultsDiv = document.getElementById('urlCheckerResults');
  if (!resultsDiv) return;
  
  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'summary';
  summaryDiv.style.padding = '10px';
  summaryDiv.style.marginTop = '10px';
  summaryDiv.style.backgroundColor = '#E8F5E9';
  summaryDiv.style.borderRadius = '4px';
  summaryDiv.style.fontSize = '12px';
  
  // 총 결과 계산
  const total = (results.outOfStock?.length || 0) + 
               (results.inStock?.length || 0) + 
               (results.removed?.length || 0) + 
               (results.error?.length || 0);
  
  summaryDiv.innerHTML = `
    <div><strong>URL 확인 완료!</strong></div>
    <div>총 확인한 URL: ${total}개</div>
    <div>품절 상품: ${results.outOfStock?.length || 0}개</div>
    <div>재고 있는 상품: ${results.inStock?.length || 0}개</div>
    <div>삭제된 상품: ${results.removed?.length || 0}개</div>
    <div>오류 발생: ${results.error?.length || 0}개</div>
  `;
  
  // 결과 영역에 추가
  resultsDiv.prepend(summaryDiv);
}

// GitHub 동기화 탭 초기화
function initGitHubSyncTab() {
  // GitHub 동기화 탭 요소 찾기
  const githubTab = document.getElementById('GitHubSync');
  if (!githubTab) return;
  
  // GitHub 설정 불러오기
  chrome.storage.local.get(['githubSettings'], function(result) {
    const settings = result.githubSettings || {};

    // 기본 UI 설정
    githubTab.innerHTML = `
      <div class="instructions">
        <strong>GitHub 동기화:</strong><br>
        이 기능은 수집된 데이터를 GitHub 저장소와 동기화합니다.<br>
        GitHub Personal Access Token을 발급받아 입력하세요.
      </div>
      
      <div class="settings-container">
        <label for="githubOwner">GitHub 계정명:</label>
        <input type="text" id="githubOwner" placeholder="your-github-username" value="${settings.owner || ''}">
        
        <label for="githubRepo">저장소 이름:</label>
        <input type="text" id="githubRepo" placeholder="your-repo-name" value="${settings.repo || ''}">
        
        <label for="githubPath">파일 경로:</label>
        <input type="text" id="githubPath" placeholder="urls.json" value="${settings.path || 'urls.json'}">
        
        <label for="githubBranch">브랜치:</label>
        <input type="text" id="githubBranch" placeholder="main" value="${settings.branch || 'main'}">
        
        <label for="githubToken">개인 액세스 토큰:</label>
        <input type="password" id="githubToken" placeholder="Personal Access Token" value="${settings.token || ''}">
      </div>
      
      <button id="saveGithubSettings">설정 저장</button>
      <button id="testGithubConnection">연결 테스트</button>
      <button id="syncToGitHub">GitHub로 동기화</button>
      <button id="importFromGitHub">GitHub에서 가져오기</button>
      
      <div id="syncStatus" class="status-indicator"></div>
    `;
    
    // 설정 저장 버튼 이벤트 핸들러
    const saveSettingsBtn = document.getElementById('saveGithubSettings');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', function() {
        const settings = {
          owner: document.getElementById('githubOwner').value.trim(),
          repo: document.getElementById('githubRepo').value.trim(),
          path: document.getElementById('githubPath').value.trim() || 'urls.json',
          branch: document.getElementById('githubBranch').value.trim() || 'main',
          token: document.getElementById('githubToken').value
        };
        
        if (!settings.owner || !settings.repo || !settings.token) {
          alert('GitHub 계정명, 저장소 이름, 토큰은 필수 입력 사항입니다.');
          return;
        }
        
        // 설정 저장
        chrome.storage.local.set({ githubSettings: settings }, function() {
          const syncStatus = document.getElementById('syncStatus');
          if (syncStatus) {
            syncStatus.textContent = '설정이 저장되었습니다.';
            syncStatus.style.display = 'block';
            syncStatus.style.backgroundColor = '#E8F5E9';
            
            // 3초 후 상태 메시지 숨기기
            setTimeout(() => {
              syncStatus.style.display = 'none';
            }, 3000);
          }
        });
      });
    }
    
    // 연결 테스트 버튼 이벤트 핸들러
    const testConnectionBtn = document.getElementById('testGithubConnection');
    if (testConnectionBtn) {
      testConnectionBtn.addEventListener('click', function() {
        const settings = {
          owner: document.getElementById('githubOwner').value.trim(),
          repo: document.getElementById('githubRepo').value.trim(),
          path: document.getElementById('githubPath').value.trim() || 'urls.json',
          branch: document.getElementById('githubBranch').value.trim() || 'main',
          token: document.getElementById('githubToken').value
        };
        
        if (!settings.owner || !settings.repo || !settings.token) {
          alert('GitHub 계정명, 저장소 이름, 토큰은 필수 입력 사항입니다.');
          return;
        }
        
        // 상태 표시
        const syncStatus = document.getElementById('syncStatus');
        if (syncStatus) {
          syncStatus.textContent = 'GitHub 연결 테스트 중...';
          syncStatus.style.display = 'block';
          syncStatus.style.backgroundColor = '#FFF9C4';
        }
        
        // GitHub Storage 초기화 및 연결 테스트
        try {
          const github = new GitHubStorage(settings);
          github.init()
            .then(result => {
              if (syncStatus) {
                syncStatus.textContent = '연결 성공! GitHub 저장소가 확인되었습니다.';
                syncStatus.style.backgroundColor = '#E8F5E9';
                
                // 설정 저장
                chrome.storage.local.set({ githubSettings: settings });
              }
            })
            .catch(error => {
              if (syncStatus) {
                syncStatus.textContent = '연결 실패: ' + error.message;
                syncStatus.style.backgroundColor = '#FFCDD2';
              }
            });
        } catch (error) {
          if (syncStatus) {
            syncStatus.textContent = '연결 오류: ' + error.message;
            syncStatus.style.backgroundColor = '#FFCDD2';
          }
        }
      });
    }
    
    // GitHub로 동기화 버튼 이벤트 핸들러
    const syncToGitHubBtn = document.getElementById('syncToGitHub');
    if (syncToGitHubBtn) {
      syncToGitHubBtn.addEventListener('click', function() {
        // GitHub 설정 확인
        chrome.storage.local.get(['githubSettings'], function(result) {
          const settings = result.githubSettings;
          
          if (!settings || !settings.owner || !settings.repo || !settings.token) {
            alert('GitHub 설정이 완료되지 않았습니다. 설정을 저장하고 연결 테스트를 먼저 진행하세요.');
            return;
          }
          
          // 상태 표시
          const syncStatus = document.getElementById('syncStatus');
          if (syncStatus) {
            syncStatus.textContent = 'GitHub로 데이터 동기화 중...';
            syncStatus.style.display = 'block';
            syncStatus.style.backgroundColor = '#FFF9C4';
          }
          
          // GitHub Storage 초기화 및 동기화
          try {
            const github = new GitHubStorage(settings);
            github.init()
              .then(() => github.syncWithLocalStorage())
              .then(result => {
                if (syncStatus) {
                  syncStatus.textContent = `동기화 완료! ${result.addedUrls}개의 URL이 추가되었습니다. 총 ${result.totalUrls}개의 URL이 GitHub에 저장되었습니다.`;
                  syncStatus.style.backgroundColor = '#E8F5E9';
                }
              })
              .catch(error => {
                if (syncStatus) {
                  syncStatus.textContent = '동기화 실패: ' + error.message;
                  syncStatus.style.backgroundColor = '#FFCDD2';
                }
              });
          } catch (error) {
            if (syncStatus) {
              syncStatus.textContent = '동기화 오류: ' + error.message;
              syncStatus.style.backgroundColor = '#FFCDD2';
            }
          }
        });
      });
    }
    
    // GitHub에서 가져오기 버튼 이벤트 핸들러
    const importFromGitHubBtn = document.getElementById('importFromGitHub');
    if (importFromGitHubBtn) {
      importFromGitHubBtn.addEventListener('click', function() {
        // GitHub 설정 확인
        chrome.storage.local.get(['githubSettings'], function(result) {
          const settings = result.githubSettings;
          
          if (!settings || !settings.owner || !settings.repo || !settings.token) {
            alert('GitHub 설정이 완료되지 않았습니다. 설정을 저장하고 연결 테스트를 먼저 진행하세요.');
            return;
          }
          
          // 상태 표시
          const syncStatus = document.getElementById('syncStatus');
          if (syncStatus) {
            syncStatus.textContent = 'GitHub에서 데이터 가져오는 중...';
            syncStatus.style.display = 'block';
            syncStatus.style.backgroundColor = '#FFF9C4';
          }
          
          // GitHub Storage 초기화 및 가져오기
          try {
            const github = new GitHubStorage(settings);
            github.init()
              .then(() => github.importToLocalStorage())
              .then(result => {
                if (syncStatus) {
                  syncStatus.textContent = `가져오기 완료! ${result.importedProducts}개의 제품과 ${result.importedOutOfStock}개의 품절 상품이 추가되었습니다.`;
                  syncStatus.style.backgroundColor = '#E8F5E9';
                  
                  // 제품 수 업데이트
                  updateProductCount();
                  updateOutOfStockCount();
                }
              })
              .catch(error => {
                if (syncStatus) {
                  syncStatus.textContent = '가져오기 실패: ' + error.message;
                  syncStatus.style.backgroundColor = '#FFCDD2';
                }
              });
          } catch (error) {
            if (syncStatus) {
              syncStatus.textContent = '가져오기 오류: ' + error.message;
              syncStatus.style.backgroundColor = '#FFCDD2';
            }
          }
        });
      });
    }
  });
}

// 자동 동기화 설정
function setupAutoSync() {
  // 자동 동기화 설정 불러오기
  chrome.storage.local.get(['autoSync', 'syncInterval'], function(result) {
    const autoSync = result.autoSync === undefined ? false : result.autoSync;
    const syncInterval = result.syncInterval || 24; // 기본값 24시간
    
    console.log('자동 동기화 설정:', { autoSync, syncInterval });
    
    // 자동 동기화가 활성화된 경우 동기화 일정 설정
    if (autoSync) {
      // 마지막 동기화 시간 확인
      chrome.storage.local.get(['lastSyncTime'], function(result) {
        const lastSyncTime = result.lastSyncTime ? new Date(result.lastSyncTime) : null;
        const now = new Date();
        
        if (!lastSyncTime || (now - lastSyncTime) >= (syncInterval * 60 * 60 * 1000)) {
          // 마지막 동기화 후 지정된 시간이 지났거나 동기화 기록이 없는 경우
          console.log('자동 동기화 실행');
          
          // GitHub 설정 확인
          chrome.storage.local.get(['githubSettings'], function(result) {
            const settings = result.githubSettings;
            
            if (settings && settings.owner && settings.repo && settings.token) {
              // GitHub Storage 초기화 및 동기화
              try {
                const github = new GitHubStorage(settings);
                github.init()
                  .then(() => github.syncWithLocalStorage())
                  .then(result => {
                    console.log('자동 동기화 완료:', result);
                    
                    // 마지막 동기화 시간 업데이트
                    chrome.storage.local.set({ lastSyncTime: now.toISOString() });
                  })
                  .catch(error => {
                    console.error('자동 동기화 실패:', error);
                  });
              } catch (error) {
                console.error('자동 동기화 오류:', error);
              }
            } else {
              console.log('GitHub 설정이 없어 자동 동기화를 건너뜁니다.');
            }
          });
        } else {
          // 다음 동기화까지 남은 시간 계산
          const nextSync = new Date(lastSyncTime.getTime() + (syncInterval * 60 * 60 * 1000));
          const timeLeft = nextSync - now;
          
          console.log(`다음 자동 동기화까지 ${Math.round(timeLeft / (60 * 60 * 1000))}시간 남았습니다.`);
        }
      });
    }
  });
}