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
  }
});// 팝업 스크립트 (popup.js)

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