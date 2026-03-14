/**
 * 食友记 - 前端应用逻辑（含社交功能）
 */

// 状态管理
const state = {
    currentMeal: '早餐',
    currentMode: 'food', // 'food' 或 'chat'
    isLoading: false,
    pendingClarification: null,
    currentUser: null,
    friends: [],
    selectedFriend: null,
    nutritionChart: null
};

// DOM 元素
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initUser();
    initMealSelector();
    initInputHandler();
    initModals();
    checkApiStatus();
    initCollapsibleSections();
});

// 初始化用户信息
async function initUser() {
    try {
        const response = await fetch('/api/profile');
        if (response.ok) {
            const user = await response.json();
            state.currentUser = user;
            
            // 显示用户名
            const usernameEl = document.getElementById('userName');
            if (usernameEl) {
                usernameEl.textContent = user.username;
            }
            
            // 加载饮食记录和消息
            loadMealRecords();
            loadMessages();
            loadDailyNutrition();
            
            // 获取 AI 问候语
            fetchGreeting();
        }
    } catch (error) {
        console.error('获取用户信息失败:', error);
    }
}

// 获取 AI 问候语
async function fetchGreeting() {
    try {
        const response = await fetch('/api/greeting');
        if (response.ok) {
            const data = await response.json();
            const greetingEl = document.getElementById('greetingText');
            if (greetingEl && data.greeting) {
                greetingEl.textContent = data.greeting;
            }
        }
    } catch (error) {
        console.error('获取问候语失败:', error);
    }
}

// 切换模式
function switchMode(mode) {
    state.currentMode = mode;
    
    // 更新按钮状态
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // 切换餐次选择器显示
    const mealSelector = document.getElementById('mealSelector');
    if (mealSelector) {
        mealSelector.classList.toggle('hidden', mode === 'chat');
    }
    
    // 更新输入框提示
    if (messageInput) {
        messageInput.placeholder = mode === 'food' 
            ? '输入您的饮食内容...' 
            : '向我咨询饮食建议...';
    }
}

// 检查 API 配置状态
async function checkApiStatus() {
    try {
        const response = await fetch('/api/status');
        const result = await response.json();
        
        if (!result.configured) {
            addErrorMessage('服务器未配置 API Key，请在 .env 文件中设置 MODELSCOPE_API_KEY');
        }
    } catch (error) {
        console.error('检查 API 状态失败:', error);
    }
}

// 初始化餐次选择器
function initMealSelector() {
    const mealBtns = document.querySelectorAll('.meal-btn');
    mealBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            mealBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentMeal = btn.dataset.meal;
        });
    });
}

// 初始化输入处理
function initInputHandler() {
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

// 初始化模态框
function initModals() {
    // 关闭按钮
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('active');
        });
    });
    
    // 点击背景关闭
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// ==================== 折叠面板功能 ====================

// 初始化折叠面板（移动端默认折叠所有面板，最大化对话区域）
function initCollapsibleSections() {
    if (window.innerWidth <= 900) {
        document.querySelectorAll('.panel-section').forEach(section => {
            section.classList.add('collapsed');
            const header = section.querySelector('.section-header');
            if (header) header.classList.add('collapsed');
        });
    }
}

// 切换面板展开/折叠
function toggleSection(headerEl) {
    const section = headerEl.closest('.panel-section');
    if (!section) return;
    section.classList.toggle('collapsed');
    headerEl.classList.toggle('collapsed');
    // 展开营养图表时触发 resize
    if (section.classList.contains('nutrition-section') && !section.classList.contains('collapsed') && state.nutritionChart) {
        setTimeout(() => state.nutritionChart.resize(), 100);
    }
}

window.toggleSection = toggleSection;

// ==================== 今日营养图表 ====================

async function loadDailyNutrition() {
    try {
        const response = await fetch('/api/daily-nutrition');
        if (!response.ok) return;

        const data = await response.json();
        const canvas = document.getElementById('nutritionChart');
        const emptyEl = document.getElementById('nutritionEmpty');
        if (!canvas || !emptyEl) return;

        if (!data.has_data) {
            canvas.style.display = 'none';
            emptyEl.style.display = 'block';
            return;
        }

        canvas.style.display = 'block';
        emptyEl.style.display = 'none';

        const labels = ['蛋白质(g)', '脂肪(g)', '碳水(g)', '膳食纤维(g)'];
        const actual = [
            data.nutrition.protein,
            data.nutrition.fat,
            data.nutrition.carbs,
            data.nutrition.fiber
        ];
        const recommended = [
            data.recommended.protein,
            data.recommended.fat,
            data.recommended.carbs,
            data.recommended.fiber
        ];

        if (state.nutritionChart) {
            state.nutritionChart.data.datasets[0].data = actual;
            state.nutritionChart.data.datasets[1].data = recommended;
            state.nutritionChart.update();
        } else {
            const ctx = canvas.getContext('2d');
            state.nutritionChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: '实际摄入',
                            data: actual,
                            backgroundColor: 'rgba(67, 160, 71, 0.8)',
                            borderColor: '#43a047',
                            borderWidth: 1,
                            borderRadius: 4
                        },
                        {
                            label: '推荐量',
                            data: recommended,
                            backgroundColor: 'rgba(200, 200, 200, 0.4)',
                            borderColor: '#bdbdbd',
                            borderWidth: 1,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { size: 11 },
                                padding: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                afterBody: function(context) {
                                    const idx = context[0].dataIndex;
                                    const act = actual[idx];
                                    const rec = recommended[idx];
                                    const pct = rec > 0 ? Math.round(act / rec * 100) : 0;
                                    return '完成度: ' + pct + '%';
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(0,0,0,0.05)' },
                            ticks: { font: { size: 11 } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { font: { size: 11 } }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('加载每日营养数据失败:', error);
    }
}

// ==================== 饮食记录功能 ====================

// 加载饮食记录
async function loadMealRecords() {
    try {
        const response = await fetch('/api/meals');
        if (response.ok) {
            const records = await response.json();
            renderMealRecords(records);
        }
    } catch (error) {
        console.error('加载饮食记录失败:', error);
    }
}

// 渲染饮食记录列表
function renderMealRecords(records) {
    const recordsList = document.getElementById('recordsList');
    if (!recordsList) return;
    
    if (records.length === 0) {
        recordsList.innerHTML = '<div class="empty-tip">暂无饮食记录</div>';
        return;
    }
    
    recordsList.innerHTML = records.map(record => {
        const mealIcons = {
            '早餐': '🌅',
            '午餐': '☀️',
            '晚餐': '🌙',
            '零食': '🍪'
        };
        const icon = mealIcons[record.meal_type] || '🍽️';
        const date = new Date(record.created_at).toLocaleDateString('zh-CN', {
            month: 'numeric',
            day: 'numeric'
        });
        
        // 解析食物列表并生成显示文本
        let foods = [];
        try {
            foods = Array.isArray(record.foods) ? record.foods : [];
        } catch(e) {
            foods = [];
        }
        const foodsText = foods.map(f => f.name).join('、') || '无详情';
        
        // 点赞/点踩显示
        const hasReactions = record.likes > 0 || record.dislikes > 0;
        const reactionsHtml = hasReactions ? `
            <div class="record-reactions">
                ${record.likes > 0 ? `<span class="reaction-stat like-stat">👍 ${record.likes}</span>` : ''}
                ${record.dislikes > 0 ? `<span class="reaction-stat dislike-stat">👎 ${record.dislikes}</span>` : ''}
            </div>
        ` : '';
        
        return `
            <div class="record-item" data-id="${record.id}">
                <div class="record-header">
                    <span class="record-icon">${icon}</span>
                    <span class="record-type">${record.meal_type}</span>
                    <span class="record-date">${date}</span>
                    <span class="record-calories">${record.total_calories} 卡</span>
                </div>
                <div class="record-foods">${escapeHtml(foodsText)}</div>
                ${reactionsHtml}
                <button class="record-delete" onclick="deleteMealRecord(${record.id})">删除</button>
            </div>
        `;
    }).join('');
}

// 删除饮食记录
async function deleteMealRecord(recordId) {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    try {
        const response = await fetch(`/api/meals/${recordId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadMealRecords();
            loadDailyNutrition();
        } else {
            alert('删除失败，请重试');
        }
    } catch (error) {
        console.error('删除记录失败:', error);
        alert('删除失败，请重试');
    }
}

// 保存饮食记录
async function saveMealRecord(mealType, totalCalories, foods, advice) {
    try {
        const response = await fetch('/api/meals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meal_type: mealType,
                total_calories: totalCalories,
                foods: foods,
                advice: advice
            })
        });
        
        if (response.ok) {
            loadMealRecords();
            loadDailyNutrition();
        }
    } catch (error) {
        console.error('保存饮食记录失败:', error);
    }
}

// ==================== 消息功能 ====================

// 加载消息
async function loadMessages() {
    try {
        const response = await fetch('/api/messages');
        if (response.ok) {
            const messages = await response.json();
            renderMessages(messages);
        }
    } catch (error) {
        console.error('加载消息失败:', error);
    }
}

// 渲染消息列表
function renderMessages(messages) {
    const messagesList = document.getElementById('messagesList');
    if (!messagesList) return;
    
    if (messages.length === 0) {
        messagesList.innerHTML = '<div class="empty-tip">暂无留言</div>';
        return;
    }
    
    messagesList.innerHTML = messages.map(msg => {
        const date = new Date(msg.created_at).toLocaleDateString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        });
        const isFromMe = state.currentUser && msg.sender_id === state.currentUser.id;
        const friendId = isFromMe ? msg.receiver_id : msg.sender_id;
        
        // 关联饮食记录信息
        let mealRefHtml = '';
        if (msg.meal_info) {
            mealRefHtml = `
                <div class="message-meal-ref">
                    <span class="meal-ref-icon">🍽️</span>
                    <span class="meal-ref-text">${msg.meal_info.meal_type}: ${escapeHtml(msg.meal_info.foods)} (${msg.meal_info.calories}卡)</span>
                </div>
            `;
        }
        
        return `
            <div class="message-item clickable" onclick="goToFriend(${friendId})">
                <div class="message-header">
                    <span class="message-sender">${isFromMe ? '我' : msg.sender_name}</span>
                    <span class="message-time">${date}</span>
                </div>
                ${mealRefHtml}
                <div class="message-text">${escapeHtml(msg.content)}</div>
            </div>
        `;
    }).join('');
}

// 跳转到好友页面
function goToFriend(friendId) {
    // 将好友 ID 存储到 sessionStorage，供好友页面使用
    sessionStorage.setItem('openFriendId', friendId);
    window.location.href = '/friends';
}

// ==================== 设置功能 ====================

// 打开设置模态框
function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal || !state.currentUser) return;
    
    // 填充当前用户信息
    document.getElementById('settingsHeight').value = state.currentUser.height || '';
    document.getElementById('settingsWeight').value = state.currentUser.weight || '';
    document.getElementById('settingsGoal').value = state.currentUser.goal || '保持体重';
    
    modal.classList.add('active');
}

// 保存设置
async function saveSettings() {
    const height = document.getElementById('settingsHeight').value;
    const weight = document.getElementById('settingsWeight').value;
    const goal = document.getElementById('settingsGoal').value;
    
    try {
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ height, weight, goal })
        });
        
        if (response.ok) {
            const updatedUser = await response.json();
            state.currentUser = updatedUser;
            document.getElementById('settingsModal').classList.remove('active');
            alert('设置已保存');
        } else {
            alert('保存失败，请重试');
        }
    } catch (error) {
        console.error('保存设置失败:', error);
        alert('保存失败，请重试');
    }
}

// ==================== 好友功能 ====================

// 打开好友模态框
async function openFriendsModal() {
    const modal = document.getElementById('friendsModal');
    if (!modal) return;
    
    // 显示邀请码
    if (state.currentUser) {
        const inviteCodeEl = document.getElementById('myInviteCode');
        if (inviteCodeEl) {
            inviteCodeEl.textContent = state.currentUser.invite_code;
        }
    }
    
    // 加载好友列表
    await loadFriends();
    
    modal.classList.add('active');
}

// 加载好友列表
async function loadFriends() {
    try {
        const response = await fetch('/api/friends');
        if (response.ok) {
            state.friends = await response.json();
            renderFriendsList();
        }
    } catch (error) {
        console.error('加载好友列表失败:', error);
    }
}

// 渲染好友列表
function renderFriendsList() {
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    if (state.friends.length === 0) {
        friendsList.innerHTML = '<div class="empty-tip">暂无好友，输入邀请码添加好友吧</div>';
        return;
    }
    
    friendsList.innerHTML = state.friends.map(friend => `
        <div class="friend-item" onclick="openFriendDetail(${friend.id})">
            <div class="friend-avatar">${friend.username.charAt(0).toUpperCase()}</div>
            <div class="friend-info">
                <div class="friend-name">${escapeHtml(friend.username)}</div>
                <div class="friend-goal">${escapeHtml(friend.goal || '未设置目标')}</div>
            </div>
        </div>
    `).join('');
}

// 添加好友
async function addFriend() {
    const inviteCodeInput = document.getElementById('friendInviteCode');
    const inviteCode = inviteCodeInput.value.trim();
    
    if (!inviteCode) {
        alert('请输入邀请码');
        return;
    }
    
    try {
        const response = await fetch('/api/friends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invite_code: inviteCode })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            inviteCodeInput.value = '';
            await loadFriends();
            alert('添加好友成功！');
        } else {
            alert(result.error || '添加好友失败');
        }
    } catch (error) {
        console.error('添加好友失败:', error);
        alert('添加好友失败，请重试');
    }
}

// 复制邀请码
function copyInviteCode() {
    const inviteCode = document.getElementById('myInviteCode').textContent;
    navigator.clipboard.writeText(inviteCode).then(() => {
        alert('邀请码已复制到剪贴板');
    }).catch(() => {
        alert('复制失败，请手动复制');
    });
}

// ==================== 好友详情功能 ====================

// 打开好友详情
async function openFriendDetail(friendId) {
    state.selectedFriend = state.friends.find(f => f.id === friendId);
    if (!state.selectedFriend) return;
    
    const modal = document.getElementById('friendDetailModal');
    if (!modal) return;
    
    // 更新好友信息
    document.getElementById('friendDetailName').textContent = state.selectedFriend.username;
    document.getElementById('friendDetailGoal').textContent = state.selectedFriend.goal || '未设置目标';
    
    // 加载好友饮食记录
    await loadFriendMeals(friendId);
    
    // 加载与该好友的消息
    await loadFriendMessages(friendId);
    
    // 关闭好友列表模态框
    document.getElementById('friendsModal').classList.remove('active');
    
    modal.classList.add('active');
}

// 加载好友饮食记录
async function loadFriendMeals(friendId) {
    try {
        const response = await fetch(`/api/friends/${friendId}/meals`);
        if (response.ok) {
            const meals = await response.json();
            renderFriendMeals(meals);
        }
    } catch (error) {
        console.error('加载好友饮食记录失败:', error);
    }
}

// 渲染好友饮食记录
function renderFriendMeals(meals) {
    const mealsList = document.getElementById('friendMealsList');
    if (!mealsList) return;
    
    if (meals.length === 0) {
        mealsList.innerHTML = '<div class="empty-tip">该好友暂无饮食记录</div>';
        return;
    }
    
    const mealIcons = {
        '早餐': '🌅',
        '午餐': '☀️',
        '晚餐': '🌙',
        '零食': '🍪'
    };
    
    mealsList.innerHTML = meals.map(meal => {
        const icon = mealIcons[meal.meal_type] || '🍽️';
        const date = new Date(meal.created_at).toLocaleDateString('zh-CN', {
            month: 'numeric',
            day: 'numeric'
        });
        
        return `
            <div class="friend-meal-item">
                <span class="meal-icon">${icon}</span>
                <span class="meal-type">${meal.meal_type}</span>
                <span class="meal-date">${date}</span>
                <span class="meal-calories">${meal.total_calories} 卡</span>
            </div>
        `;
    }).join('');
}

// 加载与好友的消息
async function loadFriendMessages(friendId) {
    try {
        const response = await fetch(`/api/messages?friend_id=${friendId}`);
        if (response.ok) {
            const messages = await response.json();
            renderFriendChatMessages(messages);
        }
    } catch (error) {
        console.error('加载消息失败:', error);
    }
}

// 渲染好友聊天消息
function renderFriendChatMessages(messages) {
    const chatContainer = document.getElementById('friendChatMessages');
    if (!chatContainer) return;
    
    if (messages.length === 0) {
        chatContainer.innerHTML = '<div class="empty-tip">暂无消息，发送一条消息吧</div>';
        return;
    }
    
    chatContainer.innerHTML = messages.map(msg => {
        const isFromMe = state.currentUser && msg.sender_id === state.currentUser.id;
        const time = new Date(msg.created_at).toLocaleTimeString('zh-CN', {
            hour: 'numeric',
            minute: 'numeric'
        });
        
        return `
            <div class="chat-message ${isFromMe ? 'sent' : 'received'}">
                <div class="chat-bubble">${escapeHtml(msg.content)}</div>
                <div class="chat-time">${time}</div>
            </div>
        `;
    }).join('');
    
    // 滚动到底部
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 发送消息给好友
async function sendFriendMessage() {
    if (!state.selectedFriend) return;
    
    const input = document.getElementById('friendMessageInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    try {
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receiver_id: state.selectedFriend.id,
                content: content
            })
        });
        
        if (response.ok) {
            input.value = '';
            await loadFriendMessages(state.selectedFriend.id);
            // 同时刷新主页消息列表
            loadMessages();
        } else {
            alert('发送失败，请重试');
        }
    } catch (error) {
        console.error('发送消息失败:', error);
        alert('发送失败，请重试');
    }
}

// ==================== 用户认证 ====================

// 退出登录
async function handleLogout() {
    if (!confirm('确定要退出登录吗？')) return;
    
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/auth';
        }
    } catch (error) {
        console.error('退出登录失败:', error);
    }
}

// ==================== 聊天功能 ====================

// 发送消息
async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message || state.isLoading) return;
    
    // 清除欢迎消息
    const welcomeMsg = chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    // 根据模式处理
    if (state.currentMode === 'chat') {
        await sendChatMessage(message);
    } else {
        await sendFoodMessage(message);
    }
}

// 发送饮食咨询消息
async function sendChatMessage(message) {
    // 添加用户消息（咨询模式）
    addUserChatMessage(message);
    messageInput.value = '';
    
    // 显示加载动画
    state.isLoading = true;
    sendBtn.disabled = true;
    const loadingEl = addLoadingIndicator();
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        
        const result = await response.json();
        loadingEl.remove();
        
        if (result.error) {
            addErrorMessage(result.error);
        } else {
            addChatReply(result.reply, message);
        }
    } catch (error) {
        loadingEl.remove();
        addErrorMessage('网络错误，请检查网络连接后重试');
    } finally {
        state.isLoading = false;
        sendBtn.disabled = false;
    }
}

// 发送食物分析消息
async function sendFoodMessage(message) {
    // 添加用户消息
    addUserMessage(message, state.currentMeal);
    messageInput.value = '';
    
    // 显示加载动画
    state.isLoading = true;
    sendBtn.disabled = true;
    const loadingEl = addLoadingIndicator();
    
    try {
        const response = await fetch('/api/analyze-meal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meal_type: state.currentMeal,
                description: message
            })
        });
        
        const result = await response.json();
        
        // 移除加载动画
        loadingEl.remove();
        
        if (result.error) {
            addErrorMessage(result.error);
        } else if (result.status === 'need_clarification') {
            addClarificationCard(result);
        } else if (result.status === 'clear') {
            addResultCard(result);
            // 保存饮食记录
            saveMealRecord(
                state.currentMeal,
                result.total_calories,
                result.foods,
                result.dietary_advice
            );
        }
    } catch (error) {
        loadingEl.remove();
        addErrorMessage('网络错误，请检查网络连接后重试');
    } finally {
        state.isLoading = false;
        sendBtn.disabled = false;
    }
}

// 添加用户消息
function addUserMessage(text, mealType) {
    const mealIcons = {
        '早餐': '🌅',
        '午餐': '☀️',
        '晚餐': '🌙',
        '零食': '🍪'
    };
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message user';
    messageEl.innerHTML = `
        <div class="message-label">${mealIcons[mealType]} ${mealType}</div>
        <div class="message-content">${escapeHtml(text)}</div>
    `;
    chatContainer.appendChild(messageEl);
    scrollToBottom();
}

// 添加用户咨询消息
function addUserChatMessage(text) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message user';
    messageEl.innerHTML = `
        <div class="message-label">💬 咨询</div>
        <div class="message-content">${escapeHtml(text)}</div>
    `;
    chatContainer.appendChild(messageEl);
    scrollToBottom();
}

// 添加 AI 咨询回复
function addChatReply(reply, query) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant';
    const formattedReply = formatReply(reply);
    messageEl.innerHTML = `
        <div class="chat-reply">${formattedReply}</div>
        <div class="reply-actions">
            <button class="feedback-btn like-feedback" onclick="submitAIFeedback(this, 'like', 'chat')">
                <span>👍</span>
            </button>
            <button class="feedback-btn dislike-feedback" onclick="submitAIFeedback(this, 'dislike', 'chat')">
                <span>👎</span>
            </button>
            <button class="share-btn" onclick="openShareModal(this, 'chat')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                分享
            </button>
        </div>
    `;
    messageEl.dataset.originalContent = reply;
    messageEl.dataset.query = query || '';
    chatContainer.appendChild(messageEl);
    scrollToBottom();
}

// 格式化 AI 回复（Markdown 转 HTML）
function formatReply(text) {
    // 先转义 HTML
    let formatted = escapeHtml(text);
    
    // 处理加粗 **text** 或 __text__
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // 处理斜体 *text* 或 _text_
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // 处理数字列表 1. 2. 3.
    formatted = formatted.replace(/^(\d+)\.\s+/gm, '<span class="list-number">$1.</span> ');
    
    // 处理无序列表 - 或 *
    formatted = formatted.replace(/^[-*]\s+/gm, '<span class="list-bullet">•</span> ');
    
    // 处理换行
    formatted = formatted.replace(/\n\n/g, '</p><p>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // 包裹在段落中
    formatted = '<p>' + formatted + '</p>';
    
    return formatted;
}

// 添加加载指示器
function addLoadingIndicator() {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'message assistant';
    loadingEl.innerHTML = `
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatContainer.appendChild(loadingEl);
    scrollToBottom();
    return loadingEl;
}

// 添加错误消息
function addErrorMessage(error) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant';
    messageEl.innerHTML = `
        <div class="message-content error-message">${escapeHtml(error)}</div>
    `;
    chatContainer.appendChild(messageEl);
    scrollToBottom();
}

// 添加结果卡片
function addResultCard(result) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant';
    
    // 生成食物列表
    const foodListHtml = result.foods.map(food => `
        <div class="food-item">
            <span class="food-name">${escapeHtml(food.name)} ${escapeHtml(food.quantity)}</span>
            <span class="food-calories">${food.calories} 卡</span>
        </div>
    `).join('');
    
    // 健康评分样式
    const score = result.health_score || 70;
    let scoreClass = 'fair';
    if (score >= 90) scoreClass = 'excellent';
    else if (score >= 70) scoreClass = 'good';
    else if (score < 50) scoreClass = 'poor';
    
    // 形象化数据
    const viz = result.visualizations || { cola: 0, rice: 0, running_km: 0 };
    
    // 生成分享文案
    const foodNames = result.foods.map(f => f.name).join('、');
    const shareText = `今日饮食：${foodNames}\n总计：${result.total_calories} 卡路里\n健康评分：${score}分\n${result.dietary_advice || ''}`;
    
    messageEl.innerHTML = `
        <div class="result-card">
            <div class="result-header">
                <div class="total-calories">${result.total_calories}<span> 卡路里</span></div>
            </div>
            <div class="food-list">
                ${foodListHtml}
            </div>
            <div class="visualizations">
                <div class="viz-item">
                    <div class="viz-icon">🥤</div>
                    <div class="viz-value">≈${viz.cola}</div>
                    <div class="viz-label">瓶可乐</div>
                </div>
                <div class="viz-item">
                    <div class="viz-icon">🍚</div>
                    <div class="viz-value">≈${viz.rice}</div>
                    <div class="viz-label">碗米饭</div>
                </div>
                <div class="viz-item">
                    <div class="viz-icon">🏃</div>
                    <div class="viz-value">≈${viz.running_km}</div>
                    <div class="viz-label">公里跑步</div>
                </div>
            </div>
            <div class="health-score">
                <div class="score-circle ${scoreClass}">${score}</div>
                <div class="score-text">健康评分</div>
            </div>
            <div class="dietary-advice">
                <h4>饮食建议</h4>
                <p>${escapeHtml(result.dietary_advice || '请保持均衡饮食，适量摄入各类营养素。')}</p>
            </div>
        </div>
        <div class="reply-actions">
            <button class="feedback-btn like-feedback" onclick="submitAIFeedback(this, 'like', 'food')">
                <span>👍</span>
            </button>
            <button class="feedback-btn dislike-feedback" onclick="submitAIFeedback(this, 'dislike', 'food')">
                <span>👎</span>
            </button>
            <button class="share-btn" onclick="openShareModal(this, 'result')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                分享
            </button>
        </div>
    `;
    messageEl.dataset.originalContent = shareText;
    chatContainer.appendChild(messageEl);
    scrollToBottom();
}

// 添加澄清卡片
function addClarificationCard(result) {
    state.pendingClarification = {
        clear_foods: result.clear_foods || [],
        ambiguous_items: result.ambiguous_items || [],
        selections: {}
    };
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant';
    messageEl.id = 'clarificationMessage';
    
    // 生成澄清选项
    const clarificationHtml = result.ambiguous_items.map((item, index) => {
        const optionsHtml = item.options.map(opt => `
            <button class="option-btn" data-index="${index}" data-value="${opt.value}" data-calories="${opt.calories}" data-label="${escapeHtml(opt.label)}">
                ${escapeHtml(opt.label)}
            </button>
        `).join('');
        
        return `
            <div class="clarification-item" data-index="${index}">
                <div class="clarification-question">${escapeHtml(item.question)}</div>
                <div class="clarification-options">${optionsHtml}</div>
            </div>
        `;
    }).join('');
    
    messageEl.innerHTML = `
        <div class="clarification-card">
            <h4>需要确认一些信息</h4>
            ${clarificationHtml}
            <button class="confirm-clarification-btn" onclick="confirmClarification()" disabled>确认选择</button>
        </div>
    `;
    
    chatContainer.appendChild(messageEl);
    
    // 绑定选项点击事件
    messageEl.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.dataset.index;
            const value = e.target.dataset.value;
            const calories = parseInt(e.target.dataset.calories);
            const label = e.target.dataset.label;
            
            // 更新选中状态
            const container = e.target.closest('.clarification-item');
            container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            
            // 保存选择
            state.pendingClarification.selections[index] = {
                food: result.ambiguous_items[index].food,
                value: value,
                calories: calories,
                selected_label: label
            };
            
            // 检查是否所有选项都已选择
            const allSelected = result.ambiguous_items.every((_, i) => 
                state.pendingClarification.selections[i] !== undefined
            );
            
            document.querySelector('.confirm-clarification-btn').disabled = !allSelected;
        });
    });
    
    scrollToBottom();
}

// 确认澄清选择
async function confirmClarification() {
    if (!state.pendingClarification) return;
    
    const clarifiedItems = Object.values(state.pendingClarification.selections);
    
    // 禁用按钮
    const confirmBtn = document.querySelector('.confirm-clarification-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '计算中...';
    
    try {
        const response = await fetch('/api/confirm-clarification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meal_type: state.currentMeal,
                clear_foods: state.pendingClarification.clear_foods,
                clarified_items: clarifiedItems
            })
        });
        
        const result = await response.json();
        
        // 移除澄清卡片
        const clarificationMsg = document.getElementById('clarificationMessage');
        if (clarificationMsg) {
            clarificationMsg.remove();
        }
        
        if (result.error) {
            addErrorMessage(result.error);
        } else {
            addResultCard(result);
            // 保存饮食记录
            saveMealRecord(
                state.currentMeal,
                result.total_calories,
                result.foods,
                result.dietary_advice
            );
        }
    } catch (error) {
        addErrorMessage('网络错误，请重试');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认选择';
    }
    
    state.pendingClarification = null;
}

// 滚动到底部
function scrollToBottom() {
    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== AI 反馈功能 ====================

// 提交 AI 回答反馈
async function submitAIFeedback(btn, type, mode) {
    const messageEl = btn.closest('.message');
    if (!messageEl) return;
    
    const actionsEl = btn.closest('.reply-actions');
    
    // 如果已经提交过反馈，不能再更改
    if (actionsEl.dataset.submitted === 'true') {
        return;
    }
    
    const response = messageEl.dataset.originalContent || '';
    const query = messageEl.dataset.query || '';
    
    let reason = '';
    
    // 点踩时询问原因
    if (type === 'dislike') {
        reason = prompt('请输入不满意的原因（可选）：') || '';
    }
    
    try {
        const res = await fetch('/api/ai-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, response, type, mode, reason })
        });
        
        if (res.ok) {
            // 标记已提交，不可更改
            actionsEl.dataset.submitted = 'true';
            
            // 更新按钮状态
            actionsEl.querySelectorAll('.feedback-btn').forEach(b => {
                b.classList.remove('active');
                b.disabled = true;
                b.style.opacity = '0.5';
                b.style.cursor = 'not-allowed';
            });
            btn.classList.add('active');
            btn.style.opacity = '1';
        }
    } catch (error) {
        console.error('提交反馈失败:', error);
    }
}

// ==================== 分享功能 ====================

let currentShareContent = '';

// 打开分享弹窗
function openShareModal(btn, type) {
    console.log('openShareModal called', btn, type);
    const messageEl = btn.closest('.message');
    if (!messageEl) {
        console.error('Cannot find parent .message element');
        return;
    }
    const content = messageEl.dataset.originalContent || '';
    console.log('Share content:', content);
    
    currentShareContent = content;
    
    // 设置分享卡片内容
    const shareContentEl = document.getElementById('shareContent');
    if (shareContentEl) {
        shareContentEl.innerHTML = formatReply(content);
    }
    
    // 显示弹窗
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.classList.add('active');
        console.log('Modal activated');
    } else {
        console.error('shareModal not found');
    }
}

// 关闭分享弹窗
function closeShareModal() {
    document.getElementById('shareModal').classList.remove('active');
}

// 下载分享图片
async function downloadShareImage() {
    const shareCard = document.getElementById('shareCard');
    
    try {
        // 使用 html2canvas 生成图片
        const canvas = await html2canvas(shareCard, {
            scale: 2,
            backgroundColor: null,
            useCORS: true
        });
        
        // 创建下载链接
        const link = document.createElement('a');
        link.download = '食友记分享_' + new Date().getTime() + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        // 提示用户
        setTimeout(() => {
            alert('图片已保存！打开微信，发送给好友或分享到朋友圈');
        }, 500);
        
    } catch (error) {
        console.error('生成图片失败:', error);
        // 降级方案：复制文字
        copyToClipboard(currentShareContent);
        alert('图片生成失败，已复制文字内容，请打开微信粘贴分享');
    }
}

// 复制到剪贴板
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

// 点击弹窗背景关闭
document.addEventListener('DOMContentLoaded', () => {
    const shareModal = document.getElementById('shareModal');
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target.id === 'shareModal') {
                closeShareModal();
            }
        });
    }
    
    // 使用事件委托处理分享按钮点击
    if (chatContainer) {
        chatContainer.addEventListener('click', (e) => {
            const shareBtn = e.target.closest('.share-btn');
            if (shareBtn) {
                const messageEl = shareBtn.closest('.message');
                if (messageEl) {
                    const content = messageEl.dataset.originalContent || '';
                    currentShareContent = content;
                    
                    const shareContentEl = document.getElementById('shareContent');
                    if (shareContentEl) {
                        shareContentEl.innerHTML = formatReply(content);
                    }
                    
                    const modal = document.getElementById('shareModal');
                    if (modal) {
                        modal.classList.add('active');
                    }
                }
            }
        });
    }
});

// 暴露函数到全局作用域
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.downloadShareImage = downloadShareImage;

// ==================== 拍照识别功能 ====================

// 相机状态
let cameraStream = null;
let capturedImageBase64 = null;

// 打开拍照弹窗
function openCameraModal() {
    capturedImageBase64 = null;
    const modal = document.getElementById('cameraModal');
    const choose = document.getElementById('cameraChoose');
    const preview = document.getElementById('cameraPreview');
    const imageArea = document.getElementById('imagePreviewArea');

    // 重置到初始选择界面
    choose.style.display = 'flex';
    preview.style.display = 'none';
    imageArea.style.display = 'none';

    modal.classList.add('active');
}

// 关闭拍照弹窗
function closeCameraModal() {
    stopCamera();
    capturedImageBase64 = null;
    document.getElementById('cameraModal').classList.remove('active');
    // 重置文件输入
    document.getElementById('imageFileInput').value = '';
}

// 停止摄像头
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    const video = document.getElementById('cameraVideo');
    if (video) {
        video.srcObject = null;
    }
}

// 启动摄像头
async function startCamera() {
    const choose = document.getElementById('cameraChoose');
    const preview = document.getElementById('cameraPreview');
    const video = document.getElementById('cameraVideo');

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
        });
        video.srcObject = cameraStream;
        choose.style.display = 'none';
        preview.style.display = 'flex';
    } catch (err) {
        alert('无法访问摄像头，请检查权限设置或使用"从相册选择"');
        console.error('摄像头访问失败:', err);
    }
}

// 拍照
function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // 压缩为 JPEG base64
    const dataUrl = compressCanvas(canvas, 1280, 1280, 0.8);
    capturedImageBase64 = dataUrl.split(',')[1];

    // 停止摄像头，显示预览
    stopCamera();
    document.getElementById('cameraPreview').style.display = 'none';
    const imageArea = document.getElementById('imagePreviewArea');
    document.getElementById('previewImage').src = dataUrl;
    imageArea.style.display = 'flex';
}

// 压缩 Canvas 到指定最大尺寸
function compressCanvas(sourceCanvas, maxWidth, maxHeight, quality) {
    let width = sourceCanvas.width;
    let height = sourceCanvas.height;

    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', quality);
}

// 处理文件上传
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
    }

    // 验证文件大小（原始最大 10MB）
    if (file.size > 10 * 1024 * 1024) {
        alert('图片过大，请选择小于10MB的图片');
        return;
    }

    try {
        const dataUrl = await compressImageFile(file, 1280, 1280, 0.8);
        capturedImageBase64 = dataUrl.split(',')[1];

        // 显示预览
        document.getElementById('cameraChoose').style.display = 'none';
        document.getElementById('cameraPreview').style.display = 'none';
        const imageArea = document.getElementById('imagePreviewArea');
        document.getElementById('previewImage').src = dataUrl;
        imageArea.style.display = 'flex';
    } catch (err) {
        alert('图片处理失败，请重试');
        console.error('图片处理失败:', err);
    }
}

// 压缩图片文件
function compressImageFile(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            URL.revokeObjectURL(img.src);
            resolve(dataUrl);
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('图片加载失败'));
        };
        img.src = URL.createObjectURL(file);
    });
}

// 重新拍摄
function retakePhoto() {
    capturedImageBase64 = null;
    document.getElementById('imagePreviewArea').style.display = 'none';
    document.getElementById('imageFileInput').value = '';
    // 回到选择界面
    document.getElementById('cameraChoose').style.display = 'flex';
}

// 确认照片并发送分析
function confirmPhoto() {
    if (!capturedImageBase64) return;
    const imageBase64 = capturedImageBase64;
    closeCameraModal();
    sendVisionMessage(imageBase64);
}

// 发送视觉分析消息
async function sendVisionMessage(imageBase64) {
    // 清除欢迎消息
    const welcomeMsg = chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    // 显示用户消息（含缩略图）
    const mealIcons = {
        '早餐': '🌅', '午餐': '☀️', '晚餐': '🌙', '零食': '🍪'
    };
    const messageEl = document.createElement('div');
    messageEl.className = 'message user';
    messageEl.innerHTML = `
        <div class="message-label">${mealIcons[state.currentMeal] || '🍽️'} ${state.currentMeal} (拍照识别)</div>
        <img class="user-image-thumbnail" src="data:image/jpeg;base64,${imageBase64}" alt="食物照片">
    `;
    chatContainer.appendChild(messageEl);
    scrollToBottom();

    // 显示加载动画
    state.isLoading = true;
    sendBtn.disabled = true;
    const loadingEl = addLoadingIndicator();

    try {
        const response = await fetch('/api/analyze-meal-vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meal_type: state.currentMeal,
                image: imageBase64
            })
        });

        const result = await response.json();
        loadingEl.remove();

        if (result.error) {
            addErrorMessage(result.error);
        } else if (result.status === 'need_clarification') {
            addClarificationCard(result);
        } else if (result.status === 'clear') {
            addResultCard(result);
            saveMealRecord(
                state.currentMeal,
                result.total_calories,
                result.foods,
                result.dietary_advice
            );
        }
    } catch (error) {
        loadingEl.remove();
        addErrorMessage('网络错误，请检查网络连接后重试');
    } finally {
        state.isLoading = false;
        sendBtn.disabled = false;
    }
}

// 暴露拍照相关函数到全局作用域
window.openCameraModal = openCameraModal;
window.closeCameraModal = closeCameraModal;
window.startCamera = startCamera;
window.capturePhoto = capturePhoto;
window.handleImageUpload = handleImageUpload;
window.retakePhoto = retakePhoto;
window.confirmPhoto = confirmPhoto;
