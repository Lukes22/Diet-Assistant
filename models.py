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
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'sender_id': self.from_user_id,
            'sender_name': self.sender.username,
            'receiver_id': self.to_user_id,
            'content': self.content,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M')
        }
