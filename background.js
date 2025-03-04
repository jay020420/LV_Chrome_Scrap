// 백그라운드 스크립트 (background.js)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadImage') {
    const folderPath = `${message.productName}/${message.material}/${message.model}/`;
    const filenameWithPath = folderPath + message.filename;
    
    // Blob URL 처리 로직 변경
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
        
        // 첫 번째 이미지인 경우 썸네일 폴더에도 저장
        if (message.isThumbnail) {
          // 확장자 추출
          const extension = filenameWithPath.split('.').pop();
          
          // 썸네일 경로 생성
          const thumbnailPath = `Thumbnail/${message.model}.${extension}`;
          
          // 썸네일 다운로드
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
  }
  // 데이터 수집 요청 처리
  else if (message.action === 'collectData') {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0) {
        return; // 활성화된 탭이 없음
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
  return true; // 비동기 응답을 위해 true 반환
});

// 팝업 페이지 설정
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setPopup({ popup: 'popup.html' });
});