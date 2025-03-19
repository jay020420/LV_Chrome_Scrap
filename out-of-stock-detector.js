// 품절 상품 감지 유틸리티 스크립트

// 루이비통 사이트에서의 품절 상태 감지 개선을 위한 유틸리티
class OutOfStockDetector {
    constructor() {
      this.outOfStockKeywords = [
        '품절', '재고 없음', '현재 재고 없음', '일시 품절', 
        'out of stock', 'sold out', 'currently unavailable'
      ];
      
      // 추가적인 품절 감지 셀렉터
      this.outOfStockSelectors = [
        '.lv-stock-availability__label',  // 재고 상태 레이블
        '.lv-product-availability',        // 제품 가용성 섹션
        '.lv-product__purchase-button--disabled'  // 비활성화된 구매 버튼
      ];
    }
  
    // 페이지 텍스트에서 품절 키워드 검사
    checkTextForOutOfStock(pageText) {
      if (!pageText) return false;
      
      const lowerPageText = pageText.toLowerCase();
      return this.outOfStockKeywords.some(keyword => 
        lowerPageText.includes(keyword.toLowerCase())
      );
    }
  
    // 품절 상태를 나타내는 HTML 요소 검사
    checkElementsForOutOfStock() {
      // 1. 선택자로 특정 품절 관련 요소 확인
      for (const selector of this.outOfStockSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          return true;
        }
      }
      
      // 2. 비활성화된 버튼 확인
      const disabledButtons = Array.from(document.querySelectorAll('button[disabled], .disabled, .out-of-stock'));
      const hasDisabledButton = disabledButtons.some(button => {
        const buttonText = button.innerText.toLowerCase();
        return buttonText.includes('구매') || buttonText.includes('장바구니') || 
               buttonText.includes('buy') || buttonText.includes('cart') ||
               buttonText.includes('add');
      });
      
      return hasDisabledButton;
    }
  
    // 색상 선택 옵션의 품절 상태 확인
    checkColorOptionsForOutOfStock() {
      try {
        // 색상 옵션 요소 선택
        const colorOptions = document.querySelectorAll('.lv-product-variation-selector-with-preview__option, .lv-product-variation-selector__option');
        const totalColorOptions = colorOptions.length;
        let outOfStockColorOptions = 0;
        
        if (totalColorOptions === 0) return false;
        
        colorOptions.forEach(option => {
          // 비활성화 상태 확인
          const isDisabled = option.getAttribute('aria-disabled') === 'true' || 
                            option.classList.contains('disabled');
          
          // 이미지 alt 텍스트 확인
          const img = option.querySelector('img');
          const altText = img ? img.getAttribute('alt') || '' : '';
          
          // 품절 표시 또는 "재고 없음" 텍스트 확인
          const outOfStockIcon = option.querySelector('.out-of-stock-icon, .unavailable');
          
          const isOutOfStock = isDisabled || 
                              altText.includes('현재 재고 없음') || 
                              altText.toLowerCase().includes('out of stock') ||
                              outOfStockIcon !== null;
          
          if (isOutOfStock) {
            outOfStockColorOptions++;
          }
        });
        
        // 모든 색상이 품절인지 확인
        return totalColorOptions > 0 && outOfStockColorOptions === totalColorOptions;
      } catch (error) {
        console.error('색상 옵션 확인 중 오류:', error);
        return false;
      }
    }
    
    // 사이즈 선택 옵션의 품절 상태 확인
    checkSizeOptionsForOutOfStock() {
      try {
        // 사이즈 옵션 요소 선택
        const sizeOptions = document.querySelectorAll('.lv-product-size-selector__option, .lv-product-variation-selector__option');
        const totalSizeOptions = sizeOptions.length;
        let outOfStockSizeOptions = 0;
        
        if (totalSizeOptions === 0) return false;
        
        sizeOptions.forEach(option => {
          const isDisabled = option.getAttribute('aria-disabled') === 'true' || 
                            option.classList.contains('disabled');
          
          if (isDisabled) {
            outOfStockSizeOptions++;
          }
        });
        
        // 모든 사이즈가 품절인지 확인
        return totalSizeOptions > 0 && outOfStockSizeOptions === totalSizeOptions;
      } catch (error) {
        console.error('사이즈 옵션 확인 중 오류:', error);
        return false;
      }
    }
    
    // 주문 가능 여부 확인
    checkOrderAvailability() {
      // 주문 버튼 확인
      const orderButtons = document.querySelectorAll('.lv-product__purchase-button, [data-testid="product-purchase-button"]');
      
      // 주문 버튼이 없거나 모두 비활성화되어 있는지 확인
      if (orderButtons.length === 0) return true; // 주문 버튼이 없으면 제품 구매 불가능으로 간주
      
      const allDisabled = Array.from(orderButtons).every(button => 
        button.hasAttribute('disabled') || 
        button.classList.contains('disabled') ||
        button.classList.contains('lv-product__purchase-button--disabled')
      );
      
      return allDisabled;
    }
    
    // 모든 검사를 종합하여 품절 여부 판단
    isProductOutOfStock() {
      // 페이지 텍스트 검사
      const pageText = document.body.innerText;
      const textCheck = this.checkTextForOutOfStock(pageText);
      
      // 품절 관련 요소 검사
      const elementCheck = this.checkElementsForOutOfStock();
      
      // 색상 옵션 검사
      const colorCheck = this.checkColorOptionsForOutOfStock();
      
      // 사이즈 옵션 검사
      const sizeCheck = this.checkSizeOptionsForOutOfStock();
      
      // 주문 가능 여부 검사
      const orderCheck = this.checkOrderAvailability();
      
      // 종합 판단 (하나라도 품절 상태면 품절로 간주)
      const isOutOfStock = textCheck || elementCheck || colorCheck || sizeCheck || orderCheck;
      
      // 판단 이유 기록
      let reasons = [];
      if (textCheck) reasons.push('품절 텍스트 발견');
      if (elementCheck) reasons.push('품절 상태 요소 발견');
      if (colorCheck) reasons.push('모든 색상 품절');
      if (sizeCheck) reasons.push('모든 사이즈 품절');
      if (orderCheck) reasons.push('주문 불가능 상태');
      
      return {
        isOutOfStock,
        reasons: reasons.join(', ')
      };
    }
  }
  
  // 전역으로 내보내기
  window.OutOfStockDetector = OutOfStockDetector;