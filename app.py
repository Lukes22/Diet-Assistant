"""
饮食助手 - Flask 后端应用
"""
import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
import json
import re

# 加载环境变量
load_dotenv()

app = Flask(__name__)
CORS(app)

# 魔搭 API 配置
MODELSCOPE_BASE_URL = "https://api-inference.modelscope.cn/v1/"
MODEL_NAME = "Qwen/Qwen3-32B"
API_KEY = os.getenv('MODELSCOPE_API_KEY', '')

# 卡路里换算常量
COLA_CALORIES = 270  # 一瓶可乐约270卡
RICE_BOWL_CALORIES = 232  # 一碗米饭约232卡
RUNNING_KM_CALORIES = 60  # 跑步1公里约消耗60卡

# AI 系统提示词
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


def get_client():
    """获取魔搭 API 客户端"""
    if not API_KEY:
        raise ValueError("未配置 MODELSCOPE_API_KEY，请在 .env 文件中设置")
    return OpenAI(
        base_url=MODELSCOPE_BASE_URL,
        api_key=API_KEY
    )


def calculate_visualizations(total_calories):
    """计算形象化展示数据"""
    return {
        "cola": round(total_calories / COLA_CALORIES, 1),
        "rice": round(total_calories / RICE_BOWL_CALORIES, 1),
        "running_km": round(total_calories / RUNNING_KM_CALORIES, 1)
    }


def parse_ai_response(response_text):
    """解析 AI 返回的 JSON"""
    # 尝试直接解析
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        pass
    
    # 尝试从代码块中提取 JSON
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    
    # 尝试找到 JSON 对象
    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    
    return None


@app.route('/')
def index():
    """主页"""
    return render_template('index.html')


@app.route('/api/status', methods=['GET'])
def api_status():
    """检查 API 配置状态"""
    if API_KEY:
        return jsonify({'configured': True, 'message': 'API 已配置'})
    else:
        return jsonify({'configured': False, 'message': '请在 .env 文件中配置 MODELSCOPE_API_KEY'})


@app.route('/api/analyze-meal', methods=['POST'])
def analyze_meal():
    """分析饮食输入"""
    data = request.json
    meal_type = data.get('meal_type', '午餐')
    description = data.get('description', '')
    
    if not API_KEY:
        return jsonify({'error': '服务器未配置 API Key，请联系管理员'}), 500
    
    if not description:
        return jsonify({'error': '请输入饮食内容'}), 400
    
    try:
        client = get_client()
        
        user_prompt = f"""餐次类型：{meal_type}
用户输入的饮食内容：{description}

请分析以上饮食内容，识别所有食物并计算卡路里。如果有描述不明确的食物，请标记为需要澄清。"""
        
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        ai_response = response.choices[0].message.content
        result = parse_ai_response(ai_response)
        
        if not result:
            return jsonify({'error': 'AI 返回格式错误，请重试'}), 500
        
        # 如果是清晰的结果，添加形象化展示
        if result.get('status') == 'clear':
            total_calories = result.get('total_calories', 0)
            result['visualizations'] = calculate_visualizations(total_calories)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'分析失败: {str(e)}'}), 500


@app.route('/api/confirm-clarification', methods=['POST'])
def confirm_clarification():
    """确认澄清后计算最终结果"""
    data = request.json
    meal_type = data.get('meal_type', '午餐')
    clear_foods = data.get('clear_foods', [])
    clarified_items = data.get('clarified_items', [])
    
    if not API_KEY:
        return jsonify({'error': '服务器未配置 API Key，请联系管理员'}), 500
    
    try:
        client = get_client()
        
        # 构建所有食物列表
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
        
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        ai_response = response.choices[0].message.content
        result = parse_ai_response(ai_response)
        
        if not result:
            # 如果 AI 解析失败，手动计算
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
        
        # 添加形象化展示
        if result.get('status') == 'clear':
            total_calories = result.get('total_calories', 0)
            result['visualizations'] = calculate_visualizations(total_calories)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'计算失败: {str(e)}'}), 500


if __name__ == '__main__':
    if not API_KEY:
        print("警告: 未配置 MODELSCOPE_API_KEY，请在 .env 文件中设置")
    app.run(debug=False, host='0.0.0.0', port=7860)
