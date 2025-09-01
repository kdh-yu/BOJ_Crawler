// HTML 문서가 완전히 로드되고 파싱된 후에 스크립트 전체를 실행합니다.
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 요소 ---
    const searchInput = document.getElementById('problemSearchInput');
    const searchResultsContainer = document.getElementById('searchResults');
    const selectedProblemsContainer = document.getElementById('selectedProblems');
    const crawlBtn = document.getElementById('crawlBtn');
    const generateBtn = document.getElementById('generateBtn');
    const statusDiv = document.getElementById('status');
    const clearBtn = document.getElementById('clearBtn');
    const spinner = document.getElementById('spinner');
    const previewArea = document.getElementById('previewArea');

    // --- 상태 변수 및 중요 설정 ---
    const selectedProblemIds = new Set();
    let debounceTimeout;
    let generatedMarkdownContent = '';

    // ✨ --- 여기가 핵심! Vercel의 전체 주소를 사용합니다 --- ✨
    // 본인의 Vercel Production 주소로 반드시 교체해주세요!
    // 예: 'https://boj-crawler-tw6o7k5il-kim-dohoons-projects.vercel.app/api/proxy?url='
    const VERCEL_PROXY_URL = 'https://boj-crawler-lqxji9hgz-kim-dohoons-projects.vercel.app/api/proxy?url=';


    // --- 이벤트 리스너 ---

    crawlBtn.addEventListener('click', async () => {
        const problemIdsToCrawl = Array.from(selectedProblemsContainer.querySelectorAll('li')).map(li => parseInt(li.dataset.id, 10));
        if (problemIdsToCrawl.length === 0) {
            alert('먼저 문제 목록을 추가해주세요.');
            return;
        }

        spinner.style.display = 'flex';
        statusDiv.textContent = '문제 정보 불러오는 중...';
        crawlBtn.disabled = true;
        generateBtn.disabled = true;
        previewArea.innerHTML = '';
        generatedMarkdownContent = '';

        try {
            const crawledProblems = [];
            for (const id of problemIdsToCrawl) {
                try {
                    statusDiv.textContent = `${id}번 문제 처리 중...`;
                    const bojData = await fetchProblemData(id);
                    const tierData = await fetchTierData(id);
                    crawledProblems.push({ ...bojData, ...tierData });
                } catch (error) {
                    console.error(error);
                    statusDiv.textContent = `⚠️ ${id}번 문제 처리 중 오류 발생. 건너뜁니다.`;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            if (crawledProblems.length > 0) {
                generatedMarkdownContent = generateMarkdownForAllProblems(crawledProblems);
                previewArea.innerHTML = marked.parse(generatedMarkdownContent);
                if (window.MathJax) {
                    MathJax.typesetPromise([previewArea]);
                }
                generateBtn.disabled = false;
                statusDiv.textContent = '✅ 문제 불러오기 완료! 아래에서 미리보기를 확인하세요.';
            } else {
                statusDiv.textContent = '❌ 처리할 수 있는 문제가 없습니다.';
            }
        } catch (error) {
            statusDiv.textContent = `❌ 오류: ${error.message}`;
        } finally {
            spinner.style.display = 'none';
            crawlBtn.disabled = false;
        }
    });

    generateBtn.addEventListener('click', () => {
        if (!generatedMarkdownContent) {
            alert('먼저 문제를 불러와주세요.');
            return;
        }
        const notebookContent = createNotebookFromMarkdown(generatedMarkdownContent);
        downloadFile('BOJ_Problems.ipynb', notebookContent);
    });

    clearBtn.addEventListener('click', () => {
        selectedProblemIds.clear();
        selectedProblemsContainer.innerHTML = '';
        previewArea.innerHTML = '';
        generatedMarkdownContent = '';
        generateBtn.disabled = true;
        statusDiv.textContent = '';
    });
    
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        const query = searchInput.value.trim();
        if (query.length < 1) {
            searchResultsContainer.style.display = 'none';
            return;
        }
        debounceTimeout = setTimeout(() => searchProblemsAPI(query), 300);
    });

    searchResultsContainer.addEventListener('click', (e) => {
        const target = e.target.closest('div');
        if (target && target.dataset.id) {
            addProblemToSelection(parseInt(target.dataset.id, 10), target.dataset.title, parseInt(target.dataset.level, 10));
            searchInput.value = '';
            searchResultsContainer.style.display = 'none';
        }
    });

    selectedProblemsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const listItem = e.target.closest('li');
            selectedProblemIds.delete(parseInt(listItem.dataset.id, 10));
            listItem.remove();
        }
    });
    
    selectedProblemsContainer.addEventListener('dragstart', e => {
        const target = e.target.closest('li');
        if (target) target.classList.add('dragging');
    });
    selectedProblemsContainer.addEventListener('dragend', e => {
        const target = e.target.closest('li');
        if (target) target.classList.remove('dragging');
    });
    selectedProblemsContainer.addEventListener('dragover', e => {
        e.preventDefault();
        const draggingItem = document.querySelector('.dragging');
        if (!draggingItem) return;
        const afterElement = getDragAfterElement(selectedProblemsContainer, e.clientY);
        if (afterElement == null) selectedProblemsContainer.appendChild(draggingItem);
        else selectedProblemsContainer.insertBefore(draggingItem, afterElement);
    });

    // --- 함수 정의 ---

    async function searchProblemsAPI(query) {
        statusDiv.textContent = `"${query}" 검색 중...`;
        try {
            const solvedAcUrl = `https://solved.ac/api/v3/search/problem?query=${encodeURIComponent(query)}&page=1&sort=id`;
            const response = await fetch(VERCEL_PROXY_URL + solvedAcUrl);
            if (!response.ok) throw new Error('API 검색에 실패했습니다.');
            const data = await response.json();
            displaySearchResults(data.items.slice(0, 5));
            statusDiv.textContent = '';
        } catch (error) {
            console.error('API 검색 오류:', error);
            statusDiv.textContent = '검색 중 오류가 발생했습니다.';
            searchResultsContainer.style.display = 'none';
        }
    }
    
    function displaySearchResults(problems) {
        searchResultsContainer.innerHTML = '';
        if (!problems || problems.length === 0) {
            searchResultsContainer.style.display = 'none';
            return;
        }
        problems.forEach(problem => {
            const tierInfo = mapLevelToTierInfo(problem.level);
            const tierIconHtml = `<img src="${tierInfo.tierIcon}" class="tier-icon" alt="${tierInfo.tierName}">`;
            const resultItem = document.createElement('div');
            resultItem.innerHTML = `${tierIconHtml} <span>${problem.problemId}</span> ${problem.titleKo}`;
            resultItem.dataset.id = problem.problemId;
            resultItem.dataset.title = problem.titleKo;
            resultItem.dataset.level = problem.level;
            searchResultsContainer.appendChild(resultItem);
        });
        searchResultsContainer.style.display = 'block';
    }

    function addProblemToSelection(id, title, level) {
        if (selectedProblemIds.has(id)) {
            alert('이미 추가된 문제입니다.');
            return;
        }
        selectedProblemIds.add(id);
        const tierInfo = mapLevelToTierInfo(level);
        const tierIconHtml = `<img src="${tierInfo.tierIcon}" class="selected-item-icon" alt="${tierInfo.tierName}">`;
        const listItem = document.createElement('li');
        listItem.dataset.id = id;
        listItem.draggable = true;
        listItem.innerHTML = `<div class="selected-item-info">${tierIconHtml}<span>${id} - ${title}</span></div><button class="delete-btn">×</button>`;
        selectedProblemsContainer.appendChild(listItem);
    }
    
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async function fetchProblemData(problemId) {
        const bojUrl = `https://www.acmicpc.net/problem/${problemId}`;
        const response = await fetch(VERCEL_PROXY_URL + bojUrl);
        if (!response.ok) throw new Error(`BOJ ${problemId}번 크롤링 실패 (상태 코드: ${response.status})`);
        
        const htmlString = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const title = doc.querySelector('#problem_title')?.innerText || '제목 없음';
        if (title === '제목 없음') throw new Error(`${problemId}번은 존재하지 않는 문제입니다.`);

        return {
            id: problemId,
            title,
            description: hybridHtmlParser(doc.querySelector('#problem_description')),
            inputDesc: hybridHtmlParser(doc.querySelector('#problem_input')),
            outputDesc: hybridHtmlParser(doc.querySelector('#problem_output')),
            examples: Array.from(doc.querySelectorAll('[id^="sample-input-"]')).map((inputEl, i) => {
                const outputEl = doc.querySelector(`#sample-output-${i + 1}`);
                return { input: inputEl.innerText.trim(), output: outputEl ? outputEl.innerText.trim() : '' };
            })
        };
    }

    function hybridHtmlParser(element) {
        if (!element) return '';
        let result = '';
        Array.from(element.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                switch (tagName) {
                    case 'p':
                        if (node.querySelector('img')) {
                            result += node.outerHTML;
                        } else {
                            result += hybridHtmlParser(node).trim() + '\n\n';
                        }
                        break;
                    case 'span':
                        if (node.classList.contains('tex')) {
                            let formula = node.textContent.trim();
                            if (formula.startsWith('\\(') && formula.endsWith('\\)')) formula = formula.substring(2, formula.length - 2);
                            if (formula.startsWith('\\[') && formula.endsWith('\\]')) formula = formula.substring(2, formula.length - 2);
                            result += `$${formula}$`;
                        } else {
                            result += hybridHtmlParser(node);
                        }
                        break;
                    case 'ul':
                    case 'ol':
                        Array.from(node.children).forEach(li => {
                            result += `- ${hybridHtmlParser(li).trim()}\n`;
                        });
                        result += '\n';
                        break;
                    case 'img':
                        let src = node.getAttribute('src');
                        if (src && src.startsWith('/')) {
                            src = 'https://www.acmicpc.net' + src;
                        }
                        const alt = node.getAttribute('alt') || 'image';
                        result += `![${alt}](${src})\n\n`;
                        break;
                    case 'a':
                        result += `[${node.textContent}](${node.href})`;
                        break;
                    case 'br':
                        result += '\n';
                        break;
                    default:
                        result += hybridHtmlParser(node);
                }
            }
        });
        return result;
    }

    async function fetchTierData(problemId) {
        const solvedAcUrl = `https://solved.ac/api/v3/problem/show?problemId=${problemId}`;
        const response = await fetch(VERCEL_PROXY_URL + solvedAcUrl);
        if (!response.ok) {
            console.warn(`Solved.ac에서 ${problemId}번 티어 정보 가져오기 실패`);
            return { tierName: "정보 없음", tierIcon: "" };
        }
        const data = await response.json();
        return mapLevelToTierInfo(data.level);
    }

    function mapLevelToTierInfo(level) {
        if (level === 0) return { tierName: "Unrated", tierIcon: "https://static.solved.ac/tier_small/0.svg" };
        const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ruby"];
        const roman = ["V", "IV", "III", "II", "I"];
        const tierName = `${tiers[Math.floor((level - 1) / 5)]} ${roman[(level - 1) % 5]}`;
        const tierIcon = `https://static.solved.ac/tier_small/${level}.svg`;
        return { tierName, tierIcon };
    }
    
    function generateMarkdownForAllProblems(problems) {
        return problems.map(p => {
            const tierCell = p.tierIcon ? `<img src="${p.tierIcon}" width="20px" height="20px" style="vertical-align: middle;"> ${p.tierName}` : p.tierName;
            let markdownSource = `# ${p.id} - ${p.title}\n\n문제 링크 : https://www.acmicpc.net/problem/${p.id}\n\n| 문제 번호 | 제목 | 난이도 |\n| :---: | :---: | :---: |\n| ${p.id} | ${p.title} | ${tierCell} |\n\n<hr>\n\n### 문제\n\n${p.description.trim()}\n\n### 입력\n\n${p.inputDesc.trim()}\n\n### 출력\n\n${p.outputDesc.trim()}\n\n<hr>\n\n### 예제 입력 / 출력\n\n`;
            p.examples.forEach((ex, i) => {
                markdownSource += `<details>\n<summary>예제 ${i + 1}</summary>\n\n**입력**\n\`\`\`text\n${ex.input}\n\`\`\`\n**출력**\n\`\`\`text\n${ex.output}\n\`\`\`\n\n</details>\n\n`;
            });
            return markdownSource;
        }).join('\n<br>\n<hr style="border: 1px dashed #ccc;">\n<br>\n\n');
    }

    function createNotebookFromMarkdown(markdownString) {
        const cells = [];
        const problemMarkdowns = markdownString.split('\n<br>\n<hr style="border: 1px dashed #ccc;">\n<br>\n\n');
        problemMarkdowns.forEach(md => {
            cells.push({ cell_type: "markdown", metadata: {}, source: md.split('\n').map(line => line + '\n') });
            cells.push({ cell_type: "code", execution_count: null, metadata: {}, outputs: [], source: [] });
        });
        return JSON.stringify({ cells, metadata: {}, nbformat: 4, nbformat_minor: 5 }, null, 2);
    }

    function downloadFile(filename, content) {
        const element = document.createElement('a');
        const file = new Blob([content], { type: 'application/octet-stream' });
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    // --- 초기화 ---
    searchInput.disabled = false;
    searchInput.placeholder = '문제 번호 또는 제목으로 검색...';
});