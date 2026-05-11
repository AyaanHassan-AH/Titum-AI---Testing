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

    // --- Interactive Background ---
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        document.body.style.setProperty('--mouse-x', `${x}%`);
        document.body.style.setProperty('--mouse-y', `${y}%`);
    });

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            const x = (e.touches[0].clientX / window.innerWidth) * 100;
            const y = (e.touches[0].clientY / window.innerHeight) * 100;
            document.body.style.setProperty('--mouse-x', `${x}%`);
            document.body.style.setProperty('--mouse-y', `${y}%`);
        }
    });

    // --- Data Management ---
    // Always load from LocalStorage first as a cache/fallback
    try {
        answers = JSON.parse(localStorage.getItem('titum_answers')) || {};
    } catch (e) {
        console.error("Error loading from localStorage:", e);
        answers = {};
    }

    const isFirebaseEnabled = typeof firebase !== 'undefined' && window.db;
    
    if (isFirebaseEnabled) {
        console.log("Firestore integration active.");
        const docRef = window.db.collection('titum_testing').doc('answers');
        
        // Listen for real-time updates from Firestore
        docRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data() || {};
                console.log("Firestore data received:", Object.keys(data).length, "answers found.");
                
                // Merge Firestore data into local answers (Firestore wins for remote sync)
                // We convert all keys to strings for consistency
                Object.keys(data).forEach(key => {
                    answers[key] = data[key];
                });

                localStorage.setItem('titum_answers', JSON.stringify(answers));
                updateProgress();
                refreshVisibleAnswers();
            } else {
                console.log("No Firestore document found. Initializing on first save.");
            }
        }, (error) => {
            console.error("Firestore Sync Error:", error);
        });
    } else {
        console.warn("Firebase not enabled. Using local storage only.");
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
            // Don't overwrite if the user is currently typing in this specific box
            if (document.activeElement !== input && answers[qNum] !== undefined && input.value !== answers[qNum]) {
                input.value = answers[qNum];
                checkFilled(qNum);
            }
        });
    }

    // Debounce function to prevent constant DB writes
    let saveTimeout;
    window.debouncedSave = (num, val) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveAnswer(num, val), 800); // Slightly higher debounce for Firestore
    };

    window.saveAnswer = (num, val) => {
        answers[num] = val;
        
        // Always save to localStorage immediately for instant persistence on refresh
        localStorage.setItem('titum_answers', JSON.stringify(answers));
        updateProgress();
        
        if (isFirebaseEnabled) {
            const docRef = window.db.collection('titum_testing').doc('answers');
            // Use set with merge: true to update only the specific question
            // We use string keys for Firestore fields
            docRef.set({ [String(num)]: val }, { merge: true })
                .catch(err => {
                    console.error("Firestore Sync Error:", err);
                    // Silently fail in UI to avoid annoying the user, 
                    // localStorage has already secured the data.
                });
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
        const answeredCount = Object.values(answers).filter(a => a && typeof a === 'string' && a.trim().length > 0).length;
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
            const target = e.target.closest('.nav-btn');
            if (!target) return;
            document.querySelector('.nav-btn.active').classList.remove('active');
            target.classList.add('active');
            currentPhase = parseInt(target.dataset.phase);
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
