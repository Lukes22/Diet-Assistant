"""
数据库模型定义
"""
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import random
import string

db = SQLAlchemy()


def generate_invite_code():
    """生成8位随机邀请码"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


class User(UserMixin, db.Model):
    """用户表"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    gender = db.Column(db.String(10))  # male/female
    height = db.Column(db.Float)  # cm
    weight = db.Column(db.Float)  # kg
    goal = db.Column(db.String(20))  # lose_weight/gain_muscle/maintain
    invite_code = db.Column(db.String(8), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 关系
    meal_records = db.relationship('MealRecord', backref='user', lazy='dynamic')
    sent_messages = db.relationship('Message', foreign_keys='Message.from_user_id', backref='sender', lazy='dynamic')
    received_messages = db.relationship('Message', foreign_keys='Message.to_user_id', backref='receiver', lazy='dynamic')
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'gender': self.gender,
            'height': self.height,
            'weight': self.weight,
            'goal': self.goal,
            'invite_code': self.invite_code
        }


class MealRecord(db.Model):
    """饮食记录表"""
    __tablename__ = 'meal_records'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    meal_type = db.Column(db.String(10), nullable=False)  # 早餐/午餐/晚餐/零食
    foods = db.Column(db.Text)  # JSON格式的食物列表
    total_calories = db.Column(db.Integer)
    health_score = db.Column(db.Integer)
    dietary_advice = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        import json
        return {
            'id': self.id,
            'meal_type': self.meal_type,
            'foods': json.loads(self.foods) if self.foods else [],
            'total_calories': self.total_calories,
            'health_score': self.health_score,
            'dietary_advice': self.dietary_advice,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M')
        }


class Friendship(db.Model):
    """好友关系表"""
    __tablename__ = 'friendships'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    friend_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 关系
    user = db.relationship('User', foreign_keys=[user_id])
    friend = db.relationship('User', foreign_keys=[friend_id])


class Message(db.Model):
    """留言表"""
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    meal_id = db.Column(db.Integer, db.ForeignKey('meal_records.id'), nullable=True)  # 关联的饮食记录（可选）
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 关联饮食记录
    meal = db.relationship('MealRecord', backref='comments')
    
    def to_dict(self):
        result = {
            'id': self.id,
            'sender_id': self.from_user_id,
            'sender_name': self.sender.username,
            'receiver_id': self.to_user_id,
            'content': self.content,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M')
        }
        # 如果有关联的饮食记录，添加饮食信息
        if self.meal_id and self.meal:
            import json
            foods = json.loads(self.meal.foods) if self.meal.foods else []
            food_names = '、'.join([f['name'] for f in foods]) if foods else '无详情'
            result['meal_info'] = {
                'id': self.meal.id,
                'meal_type': self.meal.meal_type,
                'foods': food_names,
                'calories': self.meal.total_calories
            }
        return result


class MealReaction(db.Model):
    """饮食记录点赞/点踩表"""
    __tablename__ = 'meal_reactions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    meal_id = db.Column(db.Integer, db.ForeignKey('meal_records.id'), nullable=False)
    reaction_type = db.Column(db.String(10), nullable=False)  # like/dislike
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 唯一约束：一个用户对一条饮食记录只能有一个反应
    __table_args__ = (db.UniqueConstraint('user_id', 'meal_id', name='unique_user_meal_reaction'),)
    
    # 关系
    user = db.relationship('User', backref='reactions')
    meal = db.relationship('MealRecord', backref='reactions')


class AIFeedback(db.Model):
    """AI回答反馈表"""
    __tablename__ = 'ai_feedbacks'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    user_query = db.Column(db.Text, nullable=False)  # 用户的问题
    response = db.Column(db.Text, nullable=False)  # AI的回答
    feedback_type = db.Column(db.String(10), nullable=False)  # like/dislike
    reason = db.Column(db.Text, nullable=True)  # 点踩原因（可选）
    mode = db.Column(db.String(10), nullable=False)  # food/chat
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 关系
    user = db.relationship('User', backref='ai_feedbacks')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.user.username,
            'query': self.user_query,
            'response': self.response[:100] + '...' if len(self.response) > 100 else self.response,
            'full_response': self.response,
            'feedback_type': self.feedback_type,
            'reason': self.reason,
            'mode': self.mode,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M')
        }
