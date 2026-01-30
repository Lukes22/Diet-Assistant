FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

WORKDIR /home/user/app

COPY ./ /home/user/app

RUN pip install flask flask-cors openai python-dotenv -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com

ENTRYPOINT ["python", "-u", "app.py"]
