/**
 * 饮食助手 - 前端应用逻辑
 */

// 状态管理
const state = {
    currentMeal: '早餐',
    isLoading: false,
    pendingClarification: null
};

// DOM 元素
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initMealSelector();
    initInputHandler();
    checkApiStatus();
});

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
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// 发送消息
async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message || state.isLoading) return;
    
    // 清除欢迎消息
    const welcomeMsg = chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
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
                    <div class="viz-value">${viz.cola}</div>
                    <div class="viz-label">瓶可乐</div>
                </div>
                <div class="viz-item">
                    <div class="viz-icon">🍚</div>
                    <div class="viz-value">${viz.rice}</div>
                    <div class="viz-label">碗米饭</div>
                </div>
                <div class="viz-item">
                    <div class="viz-icon">🏃</div>
                    <div class="viz-value">${viz.running_km}</div>
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
    `;
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
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
