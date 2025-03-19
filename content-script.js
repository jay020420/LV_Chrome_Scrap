(function() {
  // 이미 실행 중인지 확인
  const isAlreadyRunning = sessionStorage.getItem('lvExtensionRunning') === 'true';
  
  if (!isAlreadyRunning) {
    // 실행 중 표시 설정
    sessionStorage.setItem('lvExtensionRunning', 'true');
    console.log("콘텐츠 스크립트 실행 시작");
    
    // 페이지 스크롤 후 데이터 추출 시작
    scrollPageAndExtract();
    
    // 페이지 스크롤 함수 - 페이지 맨 아래까지 스크롤 후 다시 올라옴
    function scrollPageAndExtract() {
      // 현재 스크롤 위치 저장
      const originalPosition = window.scrollY;
      
      // 페이지 로딩 메시지 표시
      const loadingNotification = showNotification("페이지 이미지 로딩 중...", "info");
      
      // 부드러운 스크롤을 위한 함수
      function smoothScroll(targetY, duration, callback) {
        const startY = window.scrollY;
        const difference = targetY - startY;
        const startTime = performance.now();
        
        function step(currentTime) {
          const elapsedTime = currentTime - startTime;
          if (elapsedTime < duration) {
            // easeInOutQuad 이징 함수 적용
            const progress = elapsedTime / duration;
            const t = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            window.scrollTo(0, startY + difference * t);
            window.requestAnimationFrame(step);
          } else {
            window.scrollTo(0, targetY);
            if (callback) callback();
          }
        }
        
        window.requestAnimationFrame(step);
      }
      
      // 페이지 높이 구하기
      const pageHeight = Math.max(
        document.body.scrollHeight, 
        document.documentElement.scrollHeight,
        document.body.offsetHeight, 
        document.documentElement.offsetHeight
      );
      
      // 맨 아래로 스크롤
      smoothScroll(pageHeight, 1500, function() {
        // 맨 아래 도달 후 0.5초 대기
        setTimeout(function() {
          // 다시 원래 위치로 스크롤
          smoothScroll(originalPosition, 1000, function() {
            // 원래 위치로 돌아온 후 0.3초 대기
            setTimeout(function() {
              console.log("페이지 스크롤 완료, 데이터 추출 시작");
              if (loadingNotification) {
                loadingNotification.remove();
              }
              startExtraction();
            }, 300);
          });
        }, 500);
      });
    }
    
    // 데이터 추출 시작 함수
    async function startExtraction() {
      const data = extractData();
      
      if (!data.model) {
        showNotification('모델 ID를 추출할 수 없습니다. 루이비통 제품 페이지인지 확인하세요.', 'error');
        console.error('모델 ID를 추출할 수 없습니다. 데이터 저장을 건너뜁니다.');
        // 에러 발생 시 상태 초기화
        sessionStorage.removeItem('lvExtensionRunning');
        return;
      }
      
      // 이미지가 없는 경우
      if (data.imageUrls.length === 0) {
        showNotification('이미지를 찾을 수 없습니다. 그래도 계속 진행합니다.', 'warning');
        console.warn('이미지 URL을 추출할 수 없습니다. 이미지 없이 진행합니다.');
      }
      
      // 설명 텍스트 정리
      const formattedDescription = formatDescription(data.description, data.dimensionText);
      
      try {
        // 이미지 다운로드 설정 확인
        chrome.storage.local.get(['downloadImages'], function(result) {
          // 기본값은 true (다운로드 활성화)
          const downloadImages = result.downloadImages === undefined ? true : result.downloadImages;
          
          if (downloadImages) {
            // 설명 텍스트를 이미지로 변환
            showNotification('설명 이미지 생성 중...', 'info');
            
            // 비동기 작업을 Promise로 처리
            (async () => {
              try {
                const descriptionBlob = await textToImage(formattedDescription);
                
                // 제품 이미지 다운로드
                data.imageUrls.forEach((url, idx) => {
                  // URL에서 올바른 파일 확장자 추출
                  const urlParts = url.split('.');
                  const extension = urlParts.length > 1 ? urlParts[urlParts.length-1].split('?')[0] : 'png';
                  const filename = `${data.model}_${String(idx + 1).padStart(3, '0')}.${extension}`;
                  
                  // 여기에 isThumbnail 플래그 추가
                  chrome.runtime.sendMessage({ 
                    action: 'downloadImage', 
                    url, 
                    filename,
                    productName: data.productName,
                    material: data.material || '기타',
                    model: data.model,
                    isThumbnail: idx === 0  // 첫 번째 이미지인 경우 Thumbnail로 표시
                  });
                  console.log(`제품 이미지 다운로드 요청: ${data.model}/${filename}`);
                });
                
                // 설명 이미지 저장
                const descriptionObjectUrl = URL.createObjectURL(descriptionBlob);
                const descFileName = `${data.model}_description.png`;

                chrome.runtime.sendMessage({ 
                  action: 'downloadImage', 
                  url: descriptionObjectUrl, 
                  filename: descFileName,
                  productName: data.productName,
                  material: data.material || '기타',
                  model: data.model
                }, (response) => {
                  console.log('설명 이미지 다운로드 요청 완료');
                });
                
                // 이미지 다운로드 로직 완료 후 데이터 저장 진행
                saveProductData(data, formattedDescription, descFileName);
              } catch (error) {
                console.error('설명 이미지 생성 오류:', error);
                showNotification('설명 이미지 생성 중 오류가 발생했습니다.', 'error');
                
                // 오류 발생 시에도 기본 데이터는 저장
                saveProductData(data, formattedDescription);
              }
            })();
          } else {
            // 이미지 다운로드가 비활성화된 경우
            showNotification('이미지 다운로드 없이 정보만 저장합니다.', 'info');
            
            // 이미지 없이 제품 데이터만 저장
            saveProductData(data, formattedDescription);
          }
        });
      } catch (error) {
        console.error('데이터 처리 오류:', error);
        showNotification('데이터 처리 중 오류가 발생했습니다.', 'error');
        
        // 오류 발생 시에도 기본 데이터는 저장
        saveProductData(data, formattedDescription);
      }
    }
    
    // 제품 데이터 저장 함수 (이미지 처리 로직과 분리)
    function saveProductData(data, formattedDescription, descFileName = null) {
      // 데이터 객체 준비
      const productData = {
        model: data.model,
        productName: data.productName,
        price: data.price,
        color: data.color,
        material: data.material,
        description: formattedDescription
      };
      
      // 이미지 정보가 있는 경우 추가
      if (descFileName) {
        productData.descriptionImage = `${data.productName}/${data.material || '기타'}/${data.model}/${descFileName}`;
      }
      
      // 제품 이미지 정보 추가
      if (data.imageUrls && data.imageUrls.length > 0) {
        productData.images = data.imageUrls.map((url, idx) => {
          const urlParts = url.split('.');
          const extension = urlParts.length > 1 ? urlParts[urlParts.length-1].split('?')[0] : 'png';
          return `${data.productName}/${data.material || '기타'}/${data.model}/${data.model}_${String(idx + 1).padStart(3, '0')}.${extension}`;
        });
      } else {
        productData.images = [];
      }
      
      // 저장소에 데이터 저장
      chrome.storage.local.get(['products'], (result) => {
        const products = result.products || [];
        // 이미 있는 제품인지 확인
        const existingIndex = products.findIndex(p => p.model === productData.model);
        
        if (existingIndex >= 0) {
          // 기존 데이터 업데이트
          products[existingIndex] = productData;
          console.log('기존 제품 데이터 업데이트:', productData);
        } else {
          // 새 데이터 추가
          products.push(productData);
          console.log('새 제품 데이터 추가:', productData);
        }
        
        chrome.storage.local.set({ products }, () => {
          console.log('제품 데이터 저장 완료. 총 제품 수:', products.length);
          
          // 이미지 다운로드 상태에 따른 메시지
          chrome.storage.local.get(['downloadImages'], function(result) {
            const downloadImages = result.downloadImages === undefined ? true : result.downloadImages;
            
            const imageMsg = downloadImages 
              ? (productData.images.length > 0 ? `이미지 ${productData.images.length}개 다운로드 중` : '이미지 없음')
              : '이미지 다운로드 꺼짐';
              
            showNotification(`제품 정보가 저장되었습니다! (${productData.model}, ${imageMsg})`);
              
            // 완료 후 3초 후에 상태 초기화
            setTimeout(() => {
              sessionStorage.removeItem('lvExtensionRunning');
              console.log('확장 프로그램 상태 리셋 완료. 다시 실행 가능합니다.');
            }, 3000);
          });
        });
      });
    }
    
    // 텍스트를 이미지로 변환하는 함수
    function textToImage(text, width = 1000, fontSize = 24, padding = 30) {
      return new Promise((resolve) => {
        // 스타일 요소 생성 및 글꼴 로드
        const style = document.createElement('style');
        style.textContent = `
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
        `;
        document.head.appendChild(style);
        
        // 글꼴이 로드될 시간을 확보
        setTimeout(() => {
          try {
            // Canvas 요소 생성
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 폰트 설정을 단순화 (글꼴 로드 실패 대비)
            ctx.font = `${fontSize}px 'Noto Sans KR', sans-serif`;
            ctx.fillStyle = 'black';
            ctx.textBaseline = 'top';
            
            // 줄 높이 설정
            const lineHeight = fontSize * 1.4;
            
            // 텍스트 처리 및 줄바꿈
            const lines = [];
            const paragraphs = text.split('\n');
            
            paragraphs.forEach((paragraph, pIndex) => {
              if (!paragraph.trim()) {
                lines.push({ text: '', isBulletPoint: false });
                return;
              }
              
              const isBulletPoint = paragraph.trim().startsWith('·');
              
              if (isBulletPoint) {
                lines.push({ text: paragraph, isBulletPoint: true });
                return;
              }
              
              let currentLine = '';
              const words = paragraph.split(' ');
              
              words.forEach(word => {
                const testLine = currentLine + (currentLine ? ' ' : '') + word;
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > width - (padding * 2)) {
                  lines.push({ text: currentLine, isBulletPoint: false });
                  currentLine = word;
                } else {
                  currentLine = testLine;
                }
              });
              
              if (currentLine) {
                lines.push({ text: currentLine, isBulletPoint: false });
              }
              
              if (pIndex < paragraphs.length - 1) {
                lines.push({ text: '', isBulletPoint: false });
              }
            });
            
            // Canvas 크기 계산 (최대 높이 제한)
            let totalHeight = lines.reduce((sum, line, index) => {
              if (index > 0 && lines[index - 1].isBulletPoint !== line.isBulletPoint) {
                return sum + lineHeight + (fontSize / 2);
              }
              return sum + lineHeight;
            }, padding * 2);
            
            // Canvas 크기 제한 (너무 큰 Canvas는 오류 발생 가능)
            const maxHeight = 8000; // 대부분의 브라우저에서 안전한 최대 높이
            totalHeight = Math.min(totalHeight, maxHeight);
            
            canvas.width = width;
            canvas.height = totalHeight;
            
            // 배경 색상 설정
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // 텍스트 스타일 재설정
            ctx.font = `${fontSize}px 'Noto Sans KR', sans-serif`;
            ctx.fillStyle = 'black';
            ctx.textBaseline = 'top';
            
            // 텍스트 그리기
            let yPosition = padding;
            let prevIsBulletPoint = false;
            
            for (let i = 0; i < lines.length && yPosition < maxHeight - lineHeight; i++) {
              const line = lines[i];
              
              if (i > 0 && prevIsBulletPoint !== line.isBulletPoint) {
                yPosition += fontSize / 2;
              }
              
              if (line.text) {
                ctx.fillText(line.text, padding, yPosition);
              }
              
              yPosition += lineHeight;
              prevIsBulletPoint = line.isBulletPoint;
            }
            
            // Canvas를 이미지로 변환 (toBlob 대신 toDataURL 사용)
            const dataUrl = canvas.toDataURL('image/png');
            
            // DataURL을 Blob으로 변환
            fetch(dataUrl)
              .then(res => res.blob())
              .then(blob => {
                resolve(blob);
              })
              .catch(err => {
                console.error('설명 이미지 변환 오류:', err);
                // 오류 시 대체 방법 - 빈 캔버스라도 생성
                canvas.width = 500;
                canvas.height = 100;
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, 500, 100);
                ctx.fillStyle = 'black';
                ctx.font = '16px sans-serif';
                ctx.fillText('설명 이미지 생성 오류 발생', 20, 40);
                
                canvas.toBlob(fallbackBlob => {
                  resolve(fallbackBlob || new Blob([''], { type: 'image/png' }));
                }, 'image/png');
              });
          } catch (error) {
            console.error("Canvas 이미지 생성 오류:", error);
            // 오류 발생 시 빈 Blob 반환
            resolve(new Blob([''], { type: 'image/png' }));
          }
        }, 300); // 글꼴 로드를 위한 지연 시간
      });
    }

    // 데이터 추출 로직
    function extractData() {
      console.log("데이터 추출 시작...");
      
      // 모델명 추출
      const modelElement = document.querySelector('.lv-product__sku.overline');
      const model = modelElement ? modelElement.textContent.trim().replace(/<!---->/g, '') : '';
      console.log("모델명:", model);
    
      // 상품명 추출
      const productNameElement = document.querySelector('.lv-product__name');
      const productName = productNameElement ? productNameElement.textContent.trim() : '';
      console.log("상품명:", productName);
    
      // 가격 추출
      const priceElement = document.querySelector('.notranslate');
      const price = priceElement ? priceElement.textContent.trim() : '';
      console.log("가격:", price);
    
      // 색상 추출
      const colorElement = document.querySelector('.lv-product-variation-selector-with-preview__value');
      const color = colorElement ? (colorElement.firstChild ? colorElement.firstChild.textContent.trim() : '') : '';
      console.log("색상:", color);
      
      // 소재 추출
      let material = '';
      try {
        // 소재 정보를 담고 있는 버튼 찾기
        const materialButtons = Array.from(document.querySelectorAll('button.lv-product-variation-selector'));
        const materialButton = materialButtons.find(button => {
          // 버튼 내부에 "소재" 텍스트가 있는지 확인
          const title = button.querySelector('.lv-product-variation-selector__title');
          return title && title.textContent.trim() === '소재';
        });
        
        if (materialButton) {
          const materialValueElement = materialButton.querySelector('.lv-product-variation-selector__value');
          material = materialValueElement ? materialValueElement.textContent.trim() : '';
          console.log("소재명 추출 성공:", material);
        } else {
          console.log("소재 정보를 찾을 수 없습니다.");
        }
      } catch (error) {
        console.error("소재 추출 중 오류 발생:", error);
      }
    
      // 설명 추출 (HTML 포함하여 추출)
      const descriptionElement = document.querySelector('#pdp-description');
      
      // 치수 정보 추출
      const dimensionElement = document.querySelector('.lv-product-dimension.body-s');
      const dimensionText = dimensionElement ? dimensionElement.textContent.trim().replace(/\s+/g, ' ') : '';
      
      // 설명 본문
      const description = descriptionElement ? descriptionElement.innerHTML : '';
      
      console.log("설명 추출 완료 (길이):", description.length);
      console.log("치수 정보:", dimensionText);
      
      // 이미지 URL 수집
      const imageUrls = collectProductImages();
      console.log("이미지 URL 수집 완료:", imageUrls.length, "개");
    
      return { model, productName, price, color, material, description, dimensionText, imageUrls };
    }
    
    // 이미지 수집 전용 함수
    function collectProductImages() {
      const imageUrls = [];
      
      // 유효한 패턴 목록
      const validPatterns = [
        'Front view', 'Front%20view',
        'Interior view', 'Interior%20view',
        'Side view', 'Side%20view',
        'Back view', 'Back%20view',
        'Detail view', 'Detail%20view',
        'Worn view', 'Worn%20view',
        'Closeup view', 'Closeup%20view'
      ];
      
      try {
        // 메인 제품 이미지 섹션 찾기 (색상 선택 섹션 제외)
        const mainImageSections = [
          document.querySelector('.lv-product__primary-media'),  // 메인 이미지 섹션
          document.querySelector('.lv-product__gallery')         // 갤러리 섹션
        ].filter(Boolean);  // null 또는 undefined 제거
        
        // 메인 이미지 섹션에서 이미지 요소 가져오기
        let mainImages = [];
        mainImageSections.forEach(section => {
          if (section) {
            const sectionImages = section.querySelectorAll('img.lv-smart-picture__object');
            mainImages = [...mainImages, ...Array.from(sectionImages)];
          }
        });
        
        console.log(`메인 제품 이미지 섹션에서 ${mainImages.length}개의 이미지 요소를 발견했습니다.`);
        
        // 썸네일/색상 선택 이미지 제외 조건
        const isProductThumbnail = (img) => {
          // 썸네일 이미지 특성: 작은 사이즈, alt 텍스트가 짧거나 색상명 포함
          const alt = img.getAttribute('alt') || '';
          const isColorOption = alt.length < 50 || 
                               alt.includes('현재 재고 없음') || 
                               alt.includes('블랙') || 
                               alt.includes('네이비');
          
          // srcset에 특정 패턴이 있는지 확인
          const srcset = img.getAttribute('srcset') || '';
          
          // 썸네일 이미지 특성 - PM2_ 패턴이 있고 부모 요소가 색상 선택 관련 클래스를 가짐
          const isPM2Pattern = srcset.includes('PM2_');
          const parentElement = img.closest('.lv-product-variation-selector-with-preview') || 
                               img.closest('.lv-product-variation-selector') ||
                               img.closest('.lv-color-variant-container');
          
          return isColorOption && (isPM2Pattern || parentElement);
        };
        
        // 실제 이미지 URL이 있는 이미지만 필터링 (썸네일 제외)
        const productImages = mainImages.filter(img => {
          const srcset = img.getAttribute('srcset');
          const isThumbnail = isProductThumbnail(img);
          
          if (isThumbnail) {
            console.log(`❌ 썸네일 이미지로 판단되어 제외됨:`, img.getAttribute('alt'));
            return false;
          }
          
          return srcset && srcset.trim() !== '';
        });
        
        console.log(`썸네일 제외 후 ${productImages.length}개의 제품 이미지가 남았습니다.`);
        
        // 각 이미지 확인
        productImages.forEach((img, index) => {
          const srcset = img.getAttribute('srcset');
          
          // 루이비통 제품 이미지 URL 패턴 확인 (예: louis-vuitton-{제품명}--{모델ID})
          if (srcset.includes('louis-vuitton-') && srcset.includes('--')) {
            // View 패턴 확인 (제품 뷰 이미지인지)
            const viewMatch = validPatterns.some(pattern => srcset.includes(pattern));
            
            // 심층 패턴 매칭
            const containsProductView = srcset.includes('view.png') || 
                                       srcset.includes('view.jpg') || 
                                       srcset.includes('PM1_') || 
                                       srcset.includes('PM2_');
            
            if (viewMatch || containsProductView) {
              // 최대 해상도 URL 추출
              const urls = srcset.split(', ');
              if (urls.length > 0) {
                // 마지막 URL이 가장 높은 해상도
                const highestResUrl = urls[urls.length - 1].split(' ')[0];
                // URL에서 쿼리 파라미터 제거
                const cleanUrl = highestResUrl.split('?')[0];
                
                if (cleanUrl.startsWith('http') && !imageUrls.includes(cleanUrl)) {
                  console.log(`✅ 제품 이미지 #${index + 1} 발견:`, cleanUrl);
                  imageUrls.push(cleanUrl);
                }
              }
            } else {
              console.log(`❌ 제품 이미지가 아닙니다 #${index + 1}:`, srcset.substring(0, 100) + "...");
            }
          } else {
            console.log(`❌ 루이비통 제품 이미지 패턴이 아닙니다 #${index + 1}`);
          }
        });
        
        // 이미지를 찾지 못한 경우, 최대한 관대하게 재시도
        if (imageUrls.length === 0) {
          console.log("제품 이미지를 찾지 못했습니다. 더 넓은 기준으로 검색합니다...");
          
          // 전체 이미지에서 검색 (썸네일 제외)
          const allImages = Array.from(document.querySelectorAll('img.lv-smart-picture__object'))
            .filter(img => !isProductThumbnail(img) && img.getAttribute('srcset'));
          
          console.log(`썸네일 제외 후 전체 페이지에서 ${allImages.length}개의 이미지를 검사합니다.`);
          
          allImages.forEach((img, index) => {
            const srcset = img.getAttribute('srcset');
            // 루이비통 이미지 URL 패턴이 포함된 이미지 (덜 엄격한 패턴)
            if (srcset.includes('louisvuitton.com/images/is/image/lv')) {
              // 제품 이미지를 식별하는 특징
              const isProductImage = (
                srcset.includes('view.png') || 
                srcset.includes('view.jpg') ||
                validPatterns.some(pattern => srcset.includes(pattern)) ||
                srcset.includes('PM1_')
              );
              
              // 이미지 크기가 다양한 버전이 있는지 확인 (제품 이미지의 특징)
              const hasSizingPattern = srcset.includes('wid=') && srcset.includes('hei=');
              
              if (isProductImage && hasSizingPattern) {
                // 최대 해상도 URL 추출
                const urls = srcset.split(', ');
                if (urls.length > 0) {
                  const highestResUrl = urls[urls.length - 1].split(' ')[0];
                  const cleanUrl = highestResUrl.split('?')[0];
                  
                  if (cleanUrl.startsWith('http') && !imageUrls.includes(cleanUrl)) {
                    console.log(`⚠️ 대체 제품 이미지 #${index + 1} 발견:`, cleanUrl);
                    imageUrls.push(cleanUrl);
                  }
                }
              }
            }
          });
        }
      } catch (error) {
        console.error("이미지 수집 중 오류 발생:", error);
      }
      
      if (imageUrls.length === 0) {
        console.warn("⚠️ 이미지를 찾을 수 없습니다. 페이지 구조가 변경되었을 수 있습니다.");
      }
      
      return imageUrls;
    }
    
    // 설명 텍스트 정리 함수
    function formatDescription(description, dimensionText) {
      // 설명 텍스트에서 불필요한 부분 제거
      let formattedDesc = description.replace(/\(길이 x 높이 x 너비\)/g, '');
      
      // li 항목 찾기 및 포맷팅 (제외할 항목 필터링)
      const liPattern = /<li>(.*?)<\/li>/g;
      let match;
      const liItems = [];
      
      // 제외할 항목 키워드 - '&nbsp;'는 제외 (해당 문자만 제거할 예정)
      const excludeKeywords = [
        '제조자', '루이비통',
        '수입판매원', '루이비통코리아', '(유)',
      ];
      
      while ((match = liPattern.exec(description)) !== null) {
        let itemText = match[1].trim();
        
        // 빈 항목 제외
        if (itemText === '') continue;
        
        // '&nbsp;' 문자 제거 (텍스트 자체는 유지)
        itemText = itemText.replace(/&nbsp;/g, ' ');
        
        // 제외할 키워드가 포함되어 있는지 확인 (더 엄격한 검사)
        const shouldExclude = excludeKeywords.some(keyword => 
          itemText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // 추가적인 패턴 기반 검사
        const isManufacturerInfo = /제조자|수입|판매원|제조국|원산지/.test(itemText);
        
        if (!shouldExclude && !isManufacturerInfo) {
          liItems.push(`· ${itemText}`);
        } else {
          console.log(`필터링된 설명 항목: "${itemText}"`);
        }
      }
      
      // 제품 설명 부분 (첫 번째 <p> 태그 내용) 추출 및 &nbsp; 제거
      const mainDescMatch = description.match(/<p[^>]*>(.*?)<\/p>/);
      let mainDesc = mainDescMatch ? mainDescMatch[1].trim() : '';
      mainDesc = mainDesc.replace(/&nbsp;/g, ' '); // &nbsp; 문자 제거
      
      // 치수 정보 정리 (불필요한 텍스트 제거)
      let cleanDimensionText = '';
      if (dimensionText) {
        // 괄호와 그 안의 내용 제거
        cleanDimensionText = dimensionText.replace(/\([^)]*\)/g, '').trim();
        // 연속된 공백 제거
        cleanDimensionText = cleanDimensionText.replace(/\s+/g, ' ').trim();
        // &nbsp; 제거
        cleanDimensionText = cleanDimensionText.replace(/&nbsp;/g, ' ');
      }
      
      // 최종 설명 조합: 메인 설명 + 치수 정보 + 불릿 포인트
      const descriptionParts = [mainDesc];
      
      if (cleanDimensionText) {
        // 설명과 치수 사이에 공백 추가
        descriptionParts.push('');
        descriptionParts.push(`· 치수: ${cleanDimensionText}`);
      }
      
      // 각 불릿 포인트 항목을 별도의 줄로 추가
      return [...descriptionParts, ...liItems].filter(Boolean).join('\n');
    }
    
    // 사용자 인터페이스 피드백 추가
    function showNotification(message, type = 'success') {
      // 이미 있는 알림 제거
      const existingNotification = document.getElementById('lv-extension-notification');
      if (existingNotification) {
        existingNotification.remove();
      }
      
      const notification = document.createElement('div');
      notification.id = 'lv-extension-notification';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${
          type === 'success' ? '#4CAF50' : 
          type === 'warning' ? '#FF9800' : 
          type === 'info' ? '#2196F3' : 
          '#F44336'
        };
        color: white;
        padding: 16px;
        border-radius: 4px;
        z-index: 9999;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      `;
      notification.textContent = message;
      document.body.appendChild(notification);
      
      if (type !== 'info') { // 정보 알림은 사라지지 않게 함
        setTimeout(() => {
          notification.style.opacity = '0';
          notification.style.transition = 'opacity 0.5s';
          setTimeout(() => notification.remove(), 500);
        }, 3000);
      }
      
      return notification; // 나중에 수동 제거를 위해 반환
    }
    
    // 메시지 리스너 추가
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'showNotification') {
        showNotification(message.message);
      }
    });
  } else {
    // 이미 실행 중인 경우
    console.log("이미 실행 중입니다. 잠시 후 다시 시도하세요.");
    
    // 페이지에 알림 표시
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: #FF9800;
      color: white;
      padding: 16px;
      border-radius: 4px;
      z-index: 9999;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    `;
    notification.textContent = "데이터 수집이 이미 진행 중입니다. 3초 후 다시 시도하세요.";
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.5s';
      setTimeout(() => notification.remove(), 500);
    }, 3000);
  }
})(); // IIFE 종료