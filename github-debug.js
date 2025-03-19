// popup.html이 로드된 후 실행되는 디버깅 스크립트
document.addEventListener('DOMContentLoaded', function() {
    console.log('디버깅: 페이지 로드됨');
  
    // 1. GitHub 탭 버튼과 콘텐츠 확인
    const githubTabButton = document.querySelector('.tablinks[data-tab="GitHubSync"]');
    const githubTabContent = document.getElementById('GitHubSync');
  
    console.log('디버깅: GitHub 탭 버튼 존재함:', !!githubTabButton);
    console.log('디버깅: GitHub 탭 콘텐츠 존재함:', !!githubTabContent);
  
    // 2. GitHub 탭이 없으면 동적으로 생성
    if (!githubTabButton) {
      console.log('디버깅: GitHub 탭 버튼 생성 중...');
      const tabContainer = document.querySelector('.tab');
      if (tabContainer) {
        const newTabButton = document.createElement('button');
        newTabButton.className = 'tablinks';
        newTabButton.setAttribute('data-tab', 'GitHubSync');
        newTabButton.textContent = 'GitHub 동기화';
        tabContainer.appendChild(newTabButton);
        
        // 새로 생성된 버튼에 이벤트 리스너 추가
        newTabButton.addEventListener('click', function() {
          openTab(this, 'GitHubSync');
        });
        
        console.log('디버깅: GitHub 탭 버튼 생성됨');
      } else {
        console.error('디버깅: 탭 컨테이너를 찾을 수 없음');
      }
    }
  
    if (!githubTabContent) {
      console.log('디버깅: GitHub 탭 콘텐츠 생성 중...');
      // 마지막 tabcontent 요소 뒤에 새 GitHubSync 탭 콘텐츠 추가
      const lastTabContent = document.querySelector('.tabcontent:last-child');
      if (lastTabContent && lastTabContent.parentNode) {
        const newTabContent = document.createElement('div');
        newTabContent.id = 'GitHubSync';
        newTabContent.className = 'tabcontent';
        newTabContent.style.display = 'none';
        lastTabContent.parentNode.appendChild(newTabContent);
        console.log('디버깅: GitHub 탭 콘텐츠 생성됨');
      } else {
        console.error('디버깅: 마지막 탭 콘텐츠를 찾을 수 없음');
      }
    }
  
    // 3. GitHubStorage 객체 존재 여부 확인
    console.log('디버깅: GitHubStorage 클래스 존재함:', typeof GitHubStorage !== 'undefined');
    
    if (typeof GitHubStorage === 'undefined') {
      console.error('디버깅: GitHubStorage 클래스가 정의되지 않았습니다. github-storgate.js가 제대로 로드되었는지 확인하세요.');
      
      // GitHubStorage 클래스 임시 구현
      window.GitHubStorage = class GitHubStorage {
        constructor(options = {}) {
          this.options = options;
          console.log('임시 GitHubStorage 객체가 생성되었습니다.');
        }
        
        async init() {
          console.log('임시 GitHubStorage.init()이 호출되었습니다.');
          alert('GitHub 동기화 기능을 사용하기 위해 github-storgate.js 파일이 필요합니다.');
          return false;
        }
        
        async syncWithLocalStorage() {
          return { addedUrls: 0, totalUrls: 0 };
        }
        
        async importToLocalStorage() {
          return { importedProducts: 0, importedOutOfStock: 0 };
        }
      };
    }
  
    // 4. GitHub 탭 내용 설정
    // 이 함수는 GitHub 탭의 모든 내용을 명시적으로 설정합니다
    function initializeGitHubSyncTab() {
      console.log('디버깅: GitHub 동기화 탭 초기화 중...');
      
      const githubTab = document.getElementById('GitHubSync');
      if (!githubTab) {
        console.error('디버깅: GitHubSync 요소를 찾을 수 없음');
        return;
      }
      
      // 설정 불러오기
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
          
          <div id="syncStatus" class="status-indicator" style="display: none;"></div>
        `;
        
        console.log('디버깅: GitHub 탭 콘텐츠가 설정됨');
        
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
            console.log('디버깅: 연결 테스트 버튼 클릭됨');
            
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
              console.log('디버깅: GitHubStorage 객체 생성 중...');
              console.log('디버깅: 설정:', settings);
              
              if (typeof GitHubStorage !== 'function') {
                throw new Error('GitHubStorage 클래스가 정의되지 않았습니다.');
              }
              
              const github = new GitHubStorage(settings);
              console.log('디버깅: GitHubStorage 객체 생성됨');
              
              github.init()
                .then(result => {
                  console.log('디버깅: GitHubStorage.init() 결과:', result);
                  if (syncStatus) {
                    syncStatus.textContent = '연결 성공! GitHub 저장소가 확인되었습니다.';
                    syncStatus.style.backgroundColor = '#E8F5E9';
                    
                    // 설정 저장
                    chrome.storage.local.set({ githubSettings: settings });
                  }
                })
                .catch(error => {
                  console.error('디버깅: GitHub 연결 실패:', error);
                  if (syncStatus) {
                    syncStatus.textContent = '연결 실패: ' + error.message;
                    syncStatus.style.backgroundColor = '#FFCDD2';
                  }
                });
            } catch (error) {
              console.error('디버깅: GitHubStorage 객체 생성 중 오류:', error);
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
            console.log('디버깅: GitHub로 동기화 버튼 클릭됨');
            
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
                    console.log('디버깅: syncWithLocalStorage 결과:', result);
                    if (syncStatus) {
                      syncStatus.textContent = `동기화 완료! ${result.addedUrls}개의 URL이 추가되었습니다. 총 ${result.totalUrls}개의 URL이 GitHub에 저장되었습니다.`;
                      syncStatus.style.backgroundColor = '#E8F5E9';
                    }
                  })
                  .catch(error => {
                    console.error('디버깅: 동기화 실패:', error);
                    if (syncStatus) {
                      syncStatus.textContent = '동기화 실패: ' + error.message;
                      syncStatus.style.backgroundColor = '#FFCDD2';
                    }
                  });
              } catch (error) {
                console.error('디버깅: GitHubStorage 객체 생성 중 오류:', error);
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
            console.log('디버깅: GitHub에서 가져오기 버튼 클릭됨');
            
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
                    console.log('디버깅: importToLocalStorage 결과:', result);
                    if (syncStatus) {
                      syncStatus.textContent = `가져오기 완료! ${result.importedProducts}개의 제품과 ${result.importedOutOfStock}개의 품절 상품이 추가되었습니다.`;
                      syncStatus.style.backgroundColor = '#E8F5E9';
                      
                      // 제품 수 업데이트 (함수가 정의되어 있다면)
                      if (typeof updateProductCount === 'function') {
                        updateProductCount();
                      }
                      if (typeof updateOutOfStockCount === 'function') {
                        updateOutOfStockCount();
                      }
                    }
                  })
                  .catch(error => {
                    console.error('디버깅: 가져오기 실패:', error);
                    if (syncStatus) {
                      syncStatus.textContent = '가져오기 실패: ' + error.message;
                      syncStatus.style.backgroundColor = '#FFCDD2';
                    }
                  });
              } catch (error) {
                console.error('디버깅: GitHubStorage 객체 생성 중 오류:', error);
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
  
    // 5. 탭 전환 함수 구현 (원래 함수가 없거나 문제가 있을 경우 대체)
    function openTab(clickedTab, tabName) {
      console.log(`디버깅: 탭 전환 ${tabName} 시작`);
      
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
          console.log(`디버깅: 탭 ${tabName} 활성화됨`);
        } else {
          console.error(`디버깅: 탭 컨텐츠 요소 ${tabName}을 찾을 수 없음`);
        }
        
        if (clickedTab) {
          clickedTab.className += ' active';
        }
        
        // GitHub 탭이 선택된 경우 내용 초기화
        if (tabName === 'GitHubSync') {
          initializeGitHubSyncTab();
        }
      } catch (error) {
        console.error('디버깅: 탭 전환 중 오류 발생:', error);
      }
    }
  
    // GitHub 탭 버튼에 클릭 이벤트 핸들러 다시 연결
    const githubTabButtonUpdated = document.querySelector('.tablinks[data-tab="GitHubSync"]');
    if (githubTabButtonUpdated) {
      githubTabButtonUpdated.addEventListener('click', function() {
        console.log('디버깅: GitHub 탭 버튼 클릭됨');
        openTab(this, 'GitHubSync');
      });
    }
    
    // GitHub 탭 직접 초기화 (버튼 클릭 효과)
    initializeGitHubSyncTab();
    
    console.log('디버깅: 스크립트 실행 완료');
  });
  
  // 전역 openTab 함수 - 다른 스크립트에서 이 함수를 호출할 수 있게 합니다
  window.openTab = function(clickedTab, tabName) {
    console.log(`디버깅: 전역 openTab 호출됨 - ${tabName}`);
    
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
    
    // GitHub 탭이 선택된 경우 특별 처리
    if (tabName === 'GitHubSync') {
      if (typeof initializeGitHubSyncTab === 'function') {
        initializeGitHubSyncTab();
      }
    }
  };