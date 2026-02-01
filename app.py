"""
饮食助手 - Flask 后端应用（含社交功能）
"""
import os
from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_cors import CORS
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime, timedelta
import json
import re

from models import db, User, MealRecord, Friendship, Message, generate_invite_code

# 加载环境变量
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'diet-assistant-secret-key-2024')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///diet_assistant.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 初始化扩展
CORS(app, supports_credentials=True)
db.init_app(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth_page'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# 魔搭 API 配置
MODELSCOPE_BASE_URL = "https://api-inference.modelscope.cn/v1/"
MODEL_NAME = "Qwen/Qwen2.5-32B-Instruct"
API_KEY = os.getenv('MODELSCOPE_API_KEY', '')

# 卡路里换算常量
COLA_CALORIES = 270
RICE_BOWL_CALORIES = 232
RUNNING_KM_CALORIES = 60

# 问候语系统提示词
GREETING_PROMPT = """你是一个温暖友好的营养师助手"饮食助手"。请根据当前时间和用户信息，生成一句简短的问候语和鼓励话语。

要求：
1. 根据时间使用合适的问候（早上好/中午好/下午好/晚上好）
2. 结合用户的健康目标给出鼓励
3. 语气温暖、积极、简洁
4. 总长度控制在50字以内

直接输出问候语，不要加任何前缀或解释。"""

# 饮食咨询系统提示词
CHAT_PROMPT = """你是一个专业的营养师助手，名叫"饮食助手"。你可以：
1. 回答用户关于饮食、营养、健康的问题
2. 根据用户的健康目标（减重/增肌/保持规律饮食）提供个性化建议
3. 制定简单的饮食计划建议
4. 解释食物的营养价值
5. 分析和总结用户的一周饮食记录

回答要求：
- 基于《中国居民膳食指南》给出建议
- 语气专业但亲切
- 回答简洁实用，控制在300字以内
- 如果用户询问具体食物的卡路里，告诉他们可以在"记录饮食"模式输入食物来精确计算
- 如果用户让你总结或分析饮食，请根据下方的一周饮食记录进行分析

用户信息：
- 性别：{gender}
- 身高：{height}cm
- 体重：{weight}kg
- 健康目标：{goal}

用户一周饮食记录：
{meal_history}
"""

# AI 系统提示词（食物分析）
SYSTEM_PROMPT = """你是一个专业的营养师助手，负责分析用户输入的饮食内容并计算卡路里。

## 任务流程：
1. 识别用户描述中的所有食物项
2. 对每个食物，判断描述是否足够明确以估算卡路里
3. 如果存在模糊描述（如大小不明的米饭、可乐、饮料等），标记为需要澄清
4. 对明确的食物，估算合理的卡路里值
5. 根据《中国居民膳食指南》给出饮食建议

## 需要澄清的常见情况：
- 米饭、面条等主食未说明分量（大碗/中碗/小碗）
- 饮料未说明大小（大杯/中杯/小杯）
- 肉类未说明重量或分量
- 只说"一份"、"一些"等模糊词

## 输出格式要求：
必须返回严格的JSON格式，不要包含任何其他文字说明：

如果所有食物都明确：
{
  "status": "clear",
  "foods": [
    {"name": "食物名称", "quantity": "数量描述", "calories": 卡路里数值}
  ],
  "total_calories": 总卡路里数值,
  "dietary_advice": "根据中国居民膳食指南的建议（2-3句话）",
  "health_score": 健康评分0-100
}

如果存在需要澄清的食物：
{
  "status": "need_clarification",
  "clear_foods": [
    {"name": "明确的食物", "quantity": "数量", "calories": 卡路里}
  ],
  "ambiguous_items": [
    {
      "food": "食物名称",
      "question": "请问XX是什么分量？",
      "options": [
        {"label": "小碗/小杯 (约Xg)", "value": "small", "calories": 数值},
        {"label": "中碗/中杯 (约Xg)", "value": "medium", "calories": 数值},
        {"label": "大碗/大杯 (约Xg)", "value": "large", "calories": 数值}
      ]
    }
  ]
}

## 常见食物卡路里参考：
- 米饭: 小碗(150g)174卡, 中碗(200g)232卡, 大碗(300g)348卡
- 面条: 小碗200卡, 中碗300卡, 大碗400卡
- 包子: 1个约250卡（肉包），素包约200卡
- 馒头: 1个约220卡
- 鸡蛋: 1个约80卡（煮），煎蛋约120卡
- 豆浆: 1杯(250ml)约55卡（无糖），加糖约90卡
- 牛奶: 1杯(250ml)约135卡
- 可乐: 小杯(300ml)130卡, 中杯(500ml)215卡, 大杯(700ml)300卡
- 红烧肉: 1份约400-500卡
- 青菜: 1份约30-50卡
- 鸡胸肉: 100g约133卡
- 猪肉: 100g约395卡
- 牛肉: 100g约250卡
- 炒饭: 1份约500-600卡
- 饺子: 1个约40卡，10个约400卡
- 油条: 1根约230卡

## 健康评分标准（基于中国居民膳食指南）：
- 90-100分: 营养均衡，搭配合理
- 70-89分: 基本合理，略有不足
- 50-69分: 营养不够均衡，需要调整
- 50分以下: 搭配不合理，建议改善

记住：只输出JSON，不要有任何额外的文字！"""


# ========== 工具函数 ==========

def get_client():
    """获取魔搭 API 客户端"""
    if not API_KEY:
        raise ValueError("未配置 MODELSCOPE_API_KEY")
    return OpenAI(base_url=MODELSCOPE_BASE_URL, api_key=API_KEY)


def call_ai_streaming(client, messages):
    """使用流式调用 AI"""
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        temperature=0.3,
        max_tokens=2000,
        stream=True
    )
    answer_content = ""
    for chunk in response:
        if chunk.choices:
            delta = chunk.choices[0].delta
            if hasattr(delta, 'content') and delta.content:
                answer_content += delta.content
    return answer_content


def calculate_visualizations(total_calories):
    """计算形象化展示数据"""
    return {
        "cola": round(total_calories / COLA_CALORIES, 1),
        "rice": round(total_calories / RICE_BOWL_CALORIES, 1),
        "running_km": round(total_calories / RUNNING_KM_CALORIES, 1)
    }


def parse_ai_response(response_text):
    """解析 AI 返回的 JSON"""
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        pass
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    return None


# ========== 页面路由 ==========

@app.route('/')
def index():
    """主页 - 需要登录"""
    if current_user.is_authenticated:
        return render_template('index.html')
    return redirect(url_for('auth_page'))


@app.route('/auth')
def auth_page():
    """登录/注册页面"""
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('auth.html')


@app.route('/settings')
@login_required
def settings_page():
    """个人设置页面"""
    return render_template('settings.html')


@app.route('/friends')
@login_required
def friends_page():
    """好友页面"""
    return render_template('friends.html')


# ========== 用户认证 API ==========

@app.route('/api/register', methods=['POST'])
def register():
    """用户注册"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    gender = data.get('gender', '')
    height = data.get('height')
    weight = data.get('weight')
    goal = data.get('goal', '')
    
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    
    if len(username) < 2 or len(username) > 20:
        return jsonify({'error': '用户名长度应为2-20个字符'}), 400
    
    if len(password) < 6:
        return jsonify({'error': '密码长度至少6位'}), 400
    
    if User.query.filter_by(username=username).first():
        return jsonify({'error': '用户名已存在'}), 400
    
    # 生成唯一邀请码
    invite_code = generate_invite_code()
    while User.query.filter_by(invite_code=invite_code).first():
        invite_code = generate_invite_code()
    
    user = User(
        username=username,
        gender=gender,
        height=float(height) if height else None,
        weight=float(weight) if weight else None,
        goal=goal,
        invite_code=invite_code
    )
    user.set_password(password)
    
    db.session.add(user)
    db.session.commit()
    
    login_user(user)
    return jsonify({'success': True, 'user': user.to_dict()})


@app.route('/api/login', methods=['POST'])
def login():
    """用户登录"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'error': '用户名或密码错误'}), 401
    
    login_user(user)
    return jsonify({'success': True, 'user': user.to_dict()})


@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    """退出登录"""
    logout_user()
    return jsonify({'success': True})


@app.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    """获取用户信息"""
    return jsonify(current_user.to_dict())


@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    """更新用户信息"""
    data = request.json
    
    if 'height' in data:
        current_user.height = float(data['height']) if data['height'] else None
    if 'weight' in data:
        current_user.weight = float(data['weight']) if data['weight'] else None
    if 'goal' in data:
        current_user.goal = data['goal']
    
    db.session.commit()
    return jsonify({'success': True, 'user': current_user.to_dict()})


# ========== 饮食记录 API ==========

@app.route('/api/meals', methods=['GET'])
@login_required
def get_meals():
    """获取一周饮食记录"""
    week_ago = datetime.utcnow() - timedelta(days=7)
    records = MealRecord.query.filter(
        MealRecord.user_id == current_user.id,
        MealRecord.created_at >= week_ago
    ).order_by(MealRecord.created_at.desc()).all()
    return jsonify([r.to_dict() for r in records])


@app.route('/api/meals', methods=['POST'])
@login_required
def save_meal():
    """保存饮食记录"""
    data = request.json
    
    record = MealRecord(
        user_id=current_user.id,
        meal_type=data.get('meal_type', ''),
        foods=json.dumps(data.get('foods', []), ensure_ascii=False),
        total_calories=data.get('total_calories', 0),
        health_score=data.get('health_score', 0),
        dietary_advice=data.get('dietary_advice', '')
    )
    
    db.session.add(record)
    db.session.commit()
    return jsonify({'success': True, 'record': record.to_dict()})


@app.route('/api/meals/<int:meal_id>', methods=['DELETE'])
@login_required
def delete_meal(meal_id):
    """删除饮食记录"""
    record = MealRecord.query.filter_by(id=meal_id, user_id=current_user.id).first()
    if not record:
        return jsonify({'error': '记录不存在'}), 404
    
    db.session.delete(record)
    db.session.commit()
    return jsonify({'success': True})


# ========== 好友 API ==========

@app.route('/api/friends', methods=['GET'])
@login_required
def get_friends():
    """获取好友列表"""
    friendships = Friendship.query.filter_by(user_id=current_user.id).all()
    friends = []
    for f in friendships:
        friend = User.query.get(f.friend_id)
        if friend:
            friends.append({
                'id': friend.id,
                'username': friend.username,
                'goal': friend.goal
            })
    return jsonify(friends)


@app.route('/api/friends', methods=['POST'])
@login_required
def add_friend():
    """通过邀请码添加好友"""
    data = request.json
    invite_code = data.get('invite_code', '').strip().upper()
    
    if not invite_code:
        return jsonify({'error': '请输入邀请码'}), 400
    
    if invite_code == current_user.invite_code:
        return jsonify({'error': '不能添加自己为好友'}), 400
    
    friend = User.query.filter_by(invite_code=invite_code).first()
    if not friend:
        return jsonify({'error': '邀请码无效'}), 404
    
    # 检查是否已是好友
    existing = Friendship.query.filter_by(user_id=current_user.id, friend_id=friend.id).first()
    if existing:
        return jsonify({'error': '已经是好友了'}), 400
    
    # 双向添加好友关系
    friendship1 = Friendship(user_id=current_user.id, friend_id=friend.id)
    friendship2 = Friendship(user_id=friend.id, friend_id=current_user.id)
    
    db.session.add(friendship1)
    db.session.add(friendship2)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'friend': {'id': friend.id, 'username': friend.username, 'goal': friend.goal}
    })


@app.route('/api/friends/<int:friend_id>/meals', methods=['GET'])
@login_required
def get_friend_meals(friend_id):
    """查看好友一周饮食"""
    # 验证是否为好友
    friendship = Friendship.query.filter_by(user_id=current_user.id, friend_id=friend_id).first()
    if not friendship:
        return jsonify({'error': '不是好友关系'}), 403
    
    week_ago = datetime.utcnow() - timedelta(days=7)
    records = MealRecord.query.filter(
        MealRecord.user_id == friend_id,
        MealRecord.created_at >= week_ago
    ).order_by(MealRecord.created_at.desc()).all()
    
    return jsonify([r.to_dict() for r in records])


# ========== 留言 API ==========

@app.route('/api/messages', methods=['GET'])
@login_required
def get_messages():
    """获取留言"""
    friend_id = request.args.get('friend_id', type=int)
    
    if friend_id:
        # 获取与特定好友的对话
        messages = Message.query.filter(
            ((Message.from_user_id == current_user.id) & (Message.to_user_id == friend_id)) |
            ((Message.from_user_id == friend_id) & (Message.to_user_id == current_user.id))
        ).order_by(Message.created_at.asc()).limit(100).all()
    else:
        # 获取收到的所有留言
        messages = Message.query.filter_by(to_user_id=current_user.id)\
            .order_by(Message.created_at.desc()).limit(50).all()
    
    return jsonify([m.to_dict() for m in messages])


@app.route('/api/messages', methods=['POST'])
@login_required
def send_message():
    """给好友留言"""
    data = request.json
    to_user_id = data.get('receiver_id') or data.get('to_user_id')
    content = data.get('content', '').strip()
    
    if not content:
        return jsonify({'error': '留言内容不能为空'}), 400
    
    if len(content) > 200:
        return jsonify({'error': '留言内容不能超过200字'}), 400
    
    # 验证是否为好友
    friendship = Friendship.query.filter_by(user_id=current_user.id, friend_id=to_user_id).first()
    if not friendship:
        return jsonify({'error': '只能给好友留言'}), 403
    
    message = Message(
        from_user_id=current_user.id,
        to_user_id=to_user_id,
        content=content
    )
    
    db.session.add(message)
    db.session.commit()
    return jsonify({'success': True, 'message': message.to_dict()})


# ========== AI 问候和对话 API ==========

@app.route('/api/greeting', methods=['GET'])
@login_required
def get_greeting():
    """获取 AI 问候语"""
    if not API_KEY:
        return jsonify({'greeting': '欢迎回来！祝您今天饮食健康！'})
    
    try:
        # 获取当前时间段
        from datetime import datetime
        hour = datetime.now().hour
        if 5 <= hour < 11:
            time_period = "早上"
        elif 11 <= hour < 14:
            time_period = "中午"
        elif 14 <= hour < 18:
            time_period = "下午"
        else:
            time_period = "晚上"
        
        # 获取用户目标描述
        goal_map = {
            'lose_weight': '减重',
            'gain_muscle': '增肌',
            'maintain': '保持规律饮食'
        }
        user_goal = goal_map.get(current_user.goal, '保持健康')
        
        client = get_client()
        messages = [
            {"role": "system", "content": GREETING_PROMPT},
            {"role": "user", "content": f"当前时间：{time_period}，用户名：{current_user.username}，健康目标：{user_goal}"}
        ]
        
        greeting = call_ai_streaming(client, messages)
        return jsonify({'greeting': greeting.strip()})
        
    except Exception as e:
        # 降级为默认问候
        return jsonify({'greeting': f'欢迎回来，{current_user.username}！继续坚持您的健康目标！'})


@app.route('/api/chat', methods=['POST'])
@login_required
def chat():
    """AI 饮食咨询对话"""
    data = request.json
    user_message = data.get('message', '').strip()
    
    if not API_KEY:
        return jsonify({'error': '服务器未配置 API Key'}), 500
    
    if not user_message:
        return jsonify({'error': '请输入您的问题'}), 400
    
    try:
        # 准备用户信息
        goal_map = {
            'lose_weight': '减重',
            'gain_muscle': '增肌',
            'maintain': '保持规律饮食'
        }
        gender_map = {'male': '男', 'female': '女'}
        
        # 获取一周饮食记录
        week_ago = datetime.utcnow() - timedelta(days=7)
        records = MealRecord.query.filter(
            MealRecord.user_id == current_user.id,
            MealRecord.created_at >= week_ago
        ).order_by(MealRecord.created_at.desc()).all()
        
        # 格式化饮食记录
        if records:
            meal_lines = []
            for r in records:
                date_str = r.created_at.strftime('%m月%d日')
                foods = json.loads(r.foods) if r.foods else []
                food_names = '、'.join([f['name'] for f in foods]) if foods else '未记录详情'
                meal_lines.append(f"- {date_str} {r.meal_type}: {food_names} (共{r.total_calories}卡)")
            meal_history = '\n'.join(meal_lines)
        else:
            meal_history = '暂无饮食记录'
        
        system_prompt = CHAT_PROMPT.format(
            gender=gender_map.get(current_user.gender, '未知'),
            height=current_user.height or '未知',
            weight=current_user.weight or '未知',
            goal=goal_map.get(current_user.goal, '保持健康'),
            meal_history=meal_history
        )
        
        client = get_client()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        response = call_ai_streaming(client, messages)
        return jsonify({'reply': response.strip()})
        
    except Exception as e:
        return jsonify({'error': f'对话失败: {str(e)}'}), 500


# ========== AI 饮食分析 API ==========

@app.route('/api/status', methods=['GET'])
def api_status():
    """检查 API 配置状态"""
    return jsonify({
        'configured': bool(API_KEY),
        'logged_in': current_user.is_authenticated
    })


@app.route('/api/analyze-meal', methods=['POST'])
@login_required
def analyze_meal():
    """分析饮食输入"""
    data = request.json
    meal_type = data.get('meal_type', '午餐')
    description = data.get('description', '')
    
    if not API_KEY:
        return jsonify({'error': '服务器未配置 API Key'}), 500
    
    if not description:
        return jsonify({'error': '请输入饮食内容'}), 400
    
    try:
        client = get_client()
        user_prompt = f"""餐次类型：{meal_type}
用户输入的饮食内容：{description}

请分析以上饮食内容，识别所有食物并计算卡路里。如果有描述不明确的食物，请标记为需要澄清。"""
        
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]
        
        ai_response = call_ai_streaming(client, messages)
        result = parse_ai_response(ai_response)
        
        if not result:
            return jsonify({'error': 'AI 返回格式错误，请重试'}), 500
        
        if result.get('status') == 'clear':
            result['visualizations'] = calculate_visualizations(result.get('total_calories', 0))
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'分析失败: {str(e)}'}), 500


@app.route('/api/confirm-clarification', methods=['POST'])
@login_required
def confirm_clarification():
    """确认澄清后计算最终结果"""
    data = request.json
    meal_type = data.get('meal_type', '午餐')
    clear_foods = data.get('clear_foods', [])
    clarified_items = data.get('clarified_items', [])
    
    if not API_KEY:
        return jsonify({'error': '服务器未配置 API Key'}), 500
    
    try:
        client = get_client()
        
        all_foods = []
        for food in clear_foods:
            all_foods.append(f"{food['name']} {food['quantity']} ({food['calories']}卡)")
        for item in clarified_items:
            all_foods.append(f"{item['food']} {item['selected_label']} ({item['calories']}卡)")
        
        foods_text = "\n".join(all_foods)
        user_prompt = f"""餐次类型：{meal_type}
用户的完整饮食内容（已确认分量）：
{foods_text}

请计算总卡路里并给出饮食建议。直接返回 clear 状态的 JSON 结果。"""
        
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]
        
        ai_response = call_ai_streaming(client, messages)
        result = parse_ai_response(ai_response)
        
        if not result:
            total_calories = sum(f['calories'] for f in clear_foods)
            total_calories += sum(item['calories'] for item in clarified_items)
            
            foods = [{"name": f['name'], "quantity": f['quantity'], "calories": f['calories']} for f in clear_foods]
            foods.extend([{"name": item['food'], "quantity": item['selected_label'], "calories": item['calories']} for item in clarified_items])
            
            result = {
                "status": "clear",
                "foods": foods,
                "total_calories": total_calories,
                "dietary_advice": "请保持均衡饮食，适量摄入蛋白质、碳水化合物和蔬菜。",
                "health_score": 70
            }
        
        if result.get('status') == 'clear':
            result['visualizations'] = calculate_visualizations(result.get('total_calories', 0))
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'计算失败: {str(e)}'}), 500


# ========== 初始化数据库 ==========

with app.app_context():
    db.create_all()


if __name__ == '__main__':
    if not API_KEY:
        print("警告: 未配置 MODELSCOPE_API_KEY")
    app.run(debug=False, host='0.0.0.0', port=7860)
