document.addEventListener('DOMContentLoaded', () => {
    let currentPhase = 1;
    let currentCategory = null;
    let answers = {}; // Local cache of answers

    const contentArea = document.getElementById('contentArea');
    const categoryList = document.getElementById('categoryList');
    const searchInput = document.getElementById('searchInput');
    const exportBtn = document.getElementById('exportBtn');
    const progressText = document.getElementById('progressText');
    const progressBarFill = document.getElementById('progressBarFill');
    const notification = document.getElementById('notification');
    const syncStatus = document.getElementById('syncStatus');

    // --- Firebase Logic ---
    const isFirebaseEnabled = typeof firebase !== 'undefined' && window.db;
    
    if (isFirebaseEnabled) {
        const answersRef = firebase.database().ref('titum_answers');
        
        // Listen for real-time updates
        answersRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                answers = data;
                updateProgress();
                refreshVisibleAnswers();
                syncStatus.innerHTML = '<i data-lucide="cloud"></i> Synced';
                syncStatus.className = 'sync-status online';
                lucide.createIcons();
            }
        });
    } else {
        // Fallback to LocalStorage if Firebase is not configured
        answers = JSON.parse(localStorage.getItem('titum_answers')) || {};
        syncStatus.innerHTML = '<i data-lucide="hard-drive"></i> Local Mode';
    }

    // --- Core Functions ---
    renderCategories();
    renderQuestions();
    updateProgress();

    function renderCategories() {
        categoryList.innerHTML = '';
        const phaseData = questionsData.find(p => p.phase === currentPhase);
        
        phaseData.categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = `category-item ${currentCategory === cat.id ? 'active' : ''}`;
            item.innerText = cat.name;
            item.onclick = () => {
                currentCategory = cat.id;
                renderCategories();
                scrollToCategory(cat.id);
            };
            categoryList.appendChild(item);
        });
    }

    function renderQuestions(filter = '') {
        contentArea.innerHTML = '';
        const phaseData = questionsData.find(p => p.phase === currentPhase);
        
        phaseData.categories.forEach(cat => {
            const catSection = document.createElement('section');
            catSection.id = `cat-${cat.id}`;
            catSection.className = 'category-section';

            const filteredQuestions = cat.questions.filter(q => 
                q.toLowerCase().includes(filter.toLowerCase())
            );

            if (filteredQuestions.length === 0) return;

            catSection.innerHTML = `
                <div class="category-header">
                    <h2>${cat.name}</h2>
                    <p class="category-description">Phase ${currentPhase} • Section ${cat.id}</p>
                </div>
            `;

            filteredQuestions.forEach((q, idx) => {
                const qNum = currentPhase === 1 ? (cat.id - 1) * 10 + idx + 1 : (cat.id - 1) * 10 + idx + 101;
                const card = document.createElement('div');
                const hasValue = answers[qNum] && answers[qNum].trim().length > 0;
                card.className = `question-card ${hasValue ? 'filled' : ''}`;
                card.id = `q-card-${qNum}`;
                
                card.innerHTML = `
                    <div class="question-top">
                        <p class="question-text"><strong>Q${qNum}</strong> ${q}</p>
                        <button class="copy-btn" onclick="copyText('${q.replace(/'/g, "\\'")}', this)" title="Copy question">
                            <i data-lucide="copy"></i>
                        </button>
                    </div>
                    <textarea 
                        class="answer-input" 
                        placeholder="Paste Titum AI response here..."
                        oninput="debouncedSave(${qNum}, this.value)"
                        onblur="checkFilled(${qNum})"
                    >${answers[qNum] || ''}</textarea>
                `;
                catSection.appendChild(card);
            });

            contentArea.appendChild(catSection);
        });
        lucide.createIcons();
    }

    function refreshVisibleAnswers() {
        const inputs = document.querySelectorAll('.answer-input');
        inputs.forEach(input => {
            const qNum = input.getAttribute('oninput').match(/\d+/)[0];
            if (answers[qNum] && input.value !== answers[qNum]) {
                input.value = answers[qNum];
                checkFilled(qNum);
            }
        });
    }

    // Debounce function to prevent constant DB writes
    let saveTimeout;
    window.debouncedSave = (num, val) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveAnswer(num, val), 500);
    };

    window.saveAnswer = (num, val) => {
        answers[num] = val;
        
        if (isFirebaseEnabled) {
            firebase.database().ref('titum_answers/' + num).set(val);
        } else {
            localStorage.setItem('titum_answers', JSON.stringify(answers));
            updateProgress();
        }
    };

    window.checkFilled = (num) => {
        const card = document.getElementById(`q-card-${num}`);
        if (card) {
            if (answers[num] && answers[num].trim().length > 0) {
                card.classList.add('filled');
            } else {
                card.classList.remove('filled');
            }
        }
    };

    window.copyText = (text, btn) => {
        navigator.clipboard.writeText(text).then(() => {
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="check" style="color: #10b981;"></i>';
            lucide.createIcons();
            notification.classList.add('show');
            setTimeout(() => {
                btn.innerHTML = originalIcon;
                lucide.createIcons();
                notification.classList.remove('show');
            }, 2000);
        });
    };

    function updateProgress() {
        const answeredCount = Object.values(answers).filter(a => a && a.trim().length > 0).length;
        const total = 200;
        progressText.innerText = `${answeredCount} / ${total}`;
        progressBarFill.style.width = `${(answeredCount / total) * 100}%`;
    }

    function scrollToCategory(id) {
        const el = document.getElementById(`cat-${id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    }

    // --- Navigation ---
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('.nav-btn.active').classList.remove('active');
            e.target.classList.add('active');
            currentPhase = parseInt(e.target.dataset.phase);
            currentCategory = null;
            renderCategories();
            renderQuestions();
        });
    });

    searchInput.addEventListener('input', () => {
        renderQuestions(searchInput.value);
    });

    // --- Export Logic ---
    exportBtn.addEventListener('click', () => {
        let content = "TITUM AI - TESTING RESULTS\n";
        content += "===========================\n";
        content += "Exported: " + new Date().toLocaleString() + "\n\n";

        questionsData.forEach(phase => {
            content += `PHASE ${phase.phase}\n`;
            phase.categories.forEach(cat => {
                content += `\n[ SECTION ${cat.id}: ${cat.name} ]\n`;
                cat.questions.forEach((q, idx) => {
                    const qNum = phase.phase === 1 ? (cat.id - 1) * 10 + idx + 1 : (cat.id - 1) * 10 + idx + 101;
                    const ans = answers[qNum] || "[PENDING]";
                    content += `\nQ${qNum}: ${q}\n`;
                    content += `A: ${ans}\n`;
                    content += "------------------------------------------\n";
                });
            });
            content += "\n\n";
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Titum_Testing_Results_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
});
