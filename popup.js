// 팝업 스크립트 (popup.js)

document.addEventListener('DOMContentLoaded', function() {
  // 저장된 제품 수 표시
  updateProductCount();
  
  // 데이터 수집 버튼 이벤트
  document.getElementById('collectData').addEventListener('click', function() {
    // 메시지를 background.js로 보내 데이터 수집 실행
    chrome.runtime.sendMessage({ action: 'collectData' });
    
    // 사용자에게 피드백 제공
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
    
    // 팝업 닫기 (데이터 수집 시작 후)
    setTimeout(() => window.close(), 1000);
  });
  
  // 엑셀 내보내기 버튼 이벤트
  document.getElementById('exportExcel').addEventListener('click', exportToExcel);
  
  // 데이터 삭제 버튼 이벤트
  document.getElementById('clearData').addEventListener('click', function() {
    if (confirm('저장된 모든 제품 데이터를 삭제하시겠습니까?')) {
      chrome.storage.local.set({ products: [] }, function() {
        updateProductCount();
        alert('모든 제품 데이터가 삭제되었습니다.');
      });
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
      
      // 저장된 제품이 있으면 목록 표시
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

// 엑셀로 내보내기
function exportToExcel() {
  chrome.storage.local.get(['products'], function(result) {
    const products = result.products || [];
    
    if (products.length === 0) {
      alert('내보낼 제품 데이터가 없습니다.');
      return;
    }
    
    // CSV 형식으로 변환 (BOM 추가로 한글 인코딩 보장)
    // 헤더에 소재 추가하고 설명 이미지 경로와 썸네일 이미지 포함
    let csvContent = "\uFEFF모델ID,상품명,가격,색상,소재,설명이미지,썸네일이미지\n";
    
    products.forEach(product => {
      // 설명 이미지 경로 사용 (없으면 빈 문자열)
      const descriptionImage = product.descriptionImage || '';
      const material = product.material || ''; // 소재 정보가 없으면 빈 문자열
      
      // 썸네일 경로 생성 (없는 경우 대비)
      let thumbnailPath = '';
      if (product.images && product.images.length > 0) {
        const modelId = product.model;
        // 확장자 추출 (첫 번째 이미지 확장자 사용)
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

// 스토리지 변경 시 제품 수 업데이트
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.products) {
    updateProductCount();
  }
});