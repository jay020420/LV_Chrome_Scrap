// 상태 변경 기록 페이지 스크립트
document.addEventListener('DOMContentLoaded', function() {
    // 필터 상태
    let filterState = {
      status: 'all',
      periodDays: 30
    };
    
    // 상태에 따른 배지 색상 및 텍스트
    const statusConfig = {
      active: { text: '정상 판매', class: 'status-active' },
      out_of_stock: { text: '품절', class: 'status-out-of-stock' },
      removed: { text: '삭제됨', class: 'status-removed' },
      unknown: { text: '알 수 없음', class: 'status-unknown' }
    };
    
    // 초기 데이터 로드
    loadProducts();
    
    // 필터 적용 버튼 이벤트 리스너
    const applyFilterBtn = document.getElementById('applyFilter');
    if (applyFilterBtn) {
      applyFilterBtn.addEventListener('click', function() {
        const statusFilterElem = document.getElementById('statusFilter');
        const periodDaysElem = document.getElementById('periodDays');
        
        if (statusFilterElem) {
          filterState.status = statusFilterElem.value;
        }
        
        if (periodDaysElem) {
          filterState.periodDays = parseInt(periodDaysElem.value) || 30;
        }
        
        loadProducts();
      });
    }
    
    // 데이터 내보내기 버튼 이벤트 리스너
    const exportDataBtn = document.getElementById('exportData');
    if (exportDataBtn) {
      exportDataBtn.addEventListener('click', exportProductHistory);
    }
    
    // 제품 목록 및 상태 변경 기록 로드
    function loadProducts() {
      chrome.storage.local.get(['productHistory'], function(result) {
        const productHistory = result.productHistory || {};
        const productGrid = document.getElementById('productGrid');
        
        if (!productGrid) {
          console.error('제품 그리드 요소를 찾을 수 없습니다.');
          return;
        }
        
        // 그리드 초기화
        productGrid.innerHTML = '';
        
        // 필터링된 제품 목록 가져오기
        const filteredProducts = filterProducts(productHistory);
        
        if (filteredProducts.length === 0) {
          productGrid.innerHTML = `
            <div class="no-products">
              선택한 조건에 맞는 상품이 없습니다.
            </div>
          `;
          return;
        }
        
        // 제품 카드 생성
        filteredProducts.forEach(product => {
          const productCard = createProductCard(product);
          productGrid.appendChild(productCard);
        });
      });
    }
    
    // 제품 필터링
    function filterProducts(productHistory) {
      const now = new Date();
      const cutoffDate = new Date();
      cutoffDate.setDate(now.getDate() - filterState.periodDays);
      
      return Object.values(productHistory)
        .filter(product => {
          // 1. 상태 필터링
          if (filterState.status !== 'all' && product.status !== filterState.status) {
            return false;
          }
          
          // 2. 기간 필터링 - 상태 변경 기록이 있는 경우
          if (product.statusHistory && product.statusHistory.length > 0) {
            // 기간 내 상태 변경이 있는지 확인
            return product.statusHistory.some(change => {
              const changeDate = new Date(change.timestamp);
              return changeDate >= cutoffDate;
            });
          }
          
          // 3. 기간 필터링 - 상태 변경 기록이 없는 경우 마지막 확인 시간 기준
          if (product.lastChecked) {
            const lastCheckedDate = new Date(product.lastChecked);
            return lastCheckedDate >= cutoffDate;
          }
          
          return false;
        })
        .sort((a, b) => {
          // 최근 상태 변경이 있는 제품이 위에 오도록 정렬
          const dateA = a.statusHistory && a.statusHistory.length > 0 
            ? new Date(a.statusHistory[a.statusHistory.length - 1].timestamp)
            : new Date(a.lastChecked || 0);
            
          const dateB = b.statusHistory && b.statusHistory.length > 0
            ? new Date(b.statusHistory[b.statusHistory.length - 1].timestamp)
            : new Date(b.lastChecked || 0);
            
          return dateB - dateA;
        });
    }
    
    // 제품 카드 생성
    function createProductCard(product) {
      const card = document.createElement('div');
      card.className = 'product-card';
      
      // 제품 제목
      const title = document.createElement('div');
      title.className = 'product-title';
      
      const modelText = product.model ? `${product.model}` : '모델명 없음';
      const nameText = product.productName ? `${product.productName}` : '상품명 없음';
      title.textContent = `${modelText}: ${nameText}`;
      
      // 현재 상태 배지
      const statusBadge = document.createElement('span');
      const statusType = product.status || 'unknown';
      statusBadge.className = `status-badge ${statusConfig[statusType]?.class || 'status-unknown'}`;
      statusBadge.textContent = statusConfig[statusType]?.text || '알 수 없음';
      title.appendChild(document.createTextNode(' '));
      title.appendChild(statusBadge);
      
      // 제품 메타 정보
      const meta = document.createElement('div');
      meta.className = 'product-meta';
      
      if (product.price) {
        const price = document.createElement('div');
        price.className = 'product-price';
        price.textContent = `가격: ${product.price}`;
        meta.appendChild(price);
      }
      
      if (product.category) {
        const category = document.createElement('div');
        category.textContent = `카테고리: ${product.category}`;
        meta.appendChild(category);
      }
      
      if (product.url) {
        const link = document.createElement('a');
        link.className = 'product-link';
        link.href = product.url;
        link.textContent = product.url;
        link.target = '_blank';
        meta.appendChild(link);
      }
      
      // 상태 변경 기록
      const historyContainer = document.createElement('div');
      historyContainer.className = 'status-history';
      
      if (product.statusHistory && product.statusHistory.length > 0) {
        // 최신 순으로 정렬
        const sortedHistory = [...product.statusHistory].reverse();
        
        sortedHistory.forEach(change => {
          const entry = document.createElement('div');
          entry.className = 'status-entry';
          
          // 상태 변경 내용
          const statusText = document.createElement('div');
          
          // 상태 변경 배지
          const fromStatus = change.from || 'unknown';
          const toStatus = change.to || 'unknown';
          
          const fromBadge = document.createElement('span');
          fromBadge.className = `status-badge ${statusConfig[fromStatus]?.class || 'status-unknown'}`;
          fromBadge.textContent = statusConfig[fromStatus]?.text || '알 수 없음';
          
          const arrow = document.createElement('span');
          arrow.className = 'status-arrow';
          arrow.textContent = '→';
          
          const toBadge = document.createElement('span');
          toBadge.className = `status-badge ${statusConfig[toStatus]?.class || 'status-unknown'}`;
          toBadge.textContent = statusConfig[toStatus]?.text || '알 수 없음';
          
          statusText.appendChild(fromBadge);
          statusText.appendChild(arrow);
          statusText.appendChild(toBadge);
          
          // 날짜 정보
          const date = document.createElement('div');
          date.className = 'date';
          date.textContent = formatDate(new Date(change.timestamp));
          
          entry.appendChild(statusText);
          entry.appendChild(date);
          historyContainer.appendChild(entry);
        });
      } else {
        const noHistory = document.createElement('div');
        noHistory.textContent = '상태 변경 기록이 없습니다.';
        noHistory.style.padding = '5px 0';
        noHistory.style.color = '#999';
        historyContainer.appendChild(noHistory);
      }
      
      // 카드에 모든 요소 추가
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(historyContainer);
      
      return card;
    }
    
    // 날짜 포맷팅 헬퍼 함수
    function formatDate(date) {
      if (!(date instanceof Date) || isNaN(date)) {
        return '날짜 정보 없음';
      }
      
      try {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      } catch (error) {
        console.error('날짜 포맷팅 오류:', error);
        return '날짜 변환 오류';
      }
    }
    
    // 제품 기록 내보내기
    function exportProductHistory() {
      chrome.storage.local.get(['productHistory'], function(result) {
        const productHistory = result.productHistory || {};
        
        try {
          // 필터링된 제품 목록 가져오기
          const filteredProducts = filterProducts(productHistory);
          
          if (filteredProducts.length === 0) {
            alert('내보낼 데이터가 없습니다.');
            return;
          }
          
          // CSV 헤더
          let csvContent = "\uFEFF모델ID,상품명,현재상태,가격,URL,상태변경기록\n";
          
          // 각 제품 정보
          filteredProducts.forEach(product => {
            const model = product.model || '';
            const productName = product.productName || '';
            const statusType = product.status || 'unknown';
            const status = statusConfig[statusType]?.text || '알 수 없음';
            const price = product.price || '';
            const url = product.url || '';
            
            // 상태 변경 기록
            let historyText = '';
            if (product.statusHistory && product.statusHistory.length > 0) {
              historyText = product.statusHistory.map(change => {
                const fromStatus = change.from || 'unknown';
                const toStatus = change.to || 'unknown';
                const fromStatusText = statusConfig[fromStatus]?.text || '알 수 없음';
                const toStatusText = statusConfig[toStatus]?.text || '알 수 없음';
                const date = formatDate(new Date(change.timestamp));
                return `${date}: ${fromStatusText} → ${toStatusText}`;
              }).join(' | ');
            }
            
            csvContent += `"${model}","${productName}","${status}","${price}","${url}","${historyText}"\n`;
          });
          
          // CSV 파일 다운로드
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          
          const today = new Date();
          const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          
          link.setAttribute('href', url);
          link.setAttribute('download', `LouisVuitton_StatusHistory_${formattedDate}.csv`);
          link.style.visibility = 'hidden';
          
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          alert(`${filteredProducts.length}개 상품의 상태 기록이 성공적으로 내보내기 되었습니다!`);
        } catch (error) {
          console.error('내보내기 중 오류 발생:', error);
          alert('데이터 내보내기 중 오류가 발생했습니다.');
        }
      });
    }
  });