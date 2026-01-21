请帮我将我的项目修改并上传到魔搭创空间。具体要求如下：

1. 将应用的服务地址改为监听0.0.0.0（允许外部访问）
2. 将服务端口设置为7860
3. 把项目里的硬编码的API KEY都改为加载环境变量的形式，变量名为xxx_KEY，

下面是上传魔搭创空间的指南，修改完项目后，请你帮我上传代码。
step1: 克隆项目空间 git lfs install
git clone http://oauth2:ms-c4ec1832-cfd5-4e92-823b-50b0ca259681@www.modelscope.cn/studios/Lukes22/DIet_Assistant.git
   step2: 创建 app.py 文件 import gradio as gr
def modelscope_quickstart(name):
    return "Welcome to modelscope, " + name + "!!"
demo = gr.Interface(fn=modelscope_quickstart, inputs="text", outputs="text")
demo.launch(server_name="0.0.0.0", server_port=7860)
   step3: 创建 Dockerfile 文件 FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10
WORKDIR /home/user/app
COPY ./ /home/user/app
RUN pip install gradio
ENTRYPOINT ["python", "-u", "app.py"]
   step4: 提交文件 git add app.py Dockerfile
git commit -m "Add application and Dockerfile"
git push