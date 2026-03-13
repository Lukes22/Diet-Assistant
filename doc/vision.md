给这个项目添加视觉功能。用户可以使用摄像头对面前的食物进行拍照识别，再得到建议和记录。视觉识别大模型使用方法如下：

from openai import OpenAI

client = OpenAI(
    base_url='https://api-inference.modelscope.cn/v1',
    api_key='ms-7537e3f2-17c4-48df-8d70-55431394642a', # ModelScope Token
)

response = client.chat.completions.create(
    model='Qwen/Qwen3.5-397B-A17B', # ModelScope Model-Id, required
    messages=[{
        'role':
            'user',
        'content': [{
            'type': 'text',
            'text': '描述这幅图',
        }, {
            'type': 'image_url',
            'image_url': {
                'url':
                    'https://modelscope.oss-cn-beijing.aliyuncs.com/demo/images/audrey_hepburn.jpg',
            },
        }],
    }],
    stream=True
)

for chunk in response:
    if chunk.choices:
        print(chunk.choices[0].delta.content, end='', flush=True)