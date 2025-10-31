# .devcontainer/Dockerfile
FROM node:20-bullseye

# 安装 zsh 和常用工具
RUN apt-get update && apt-get install -y \
    zsh \
    git \
    curl \
    wget \
    vim \
    locales \
    && rm -rf /var/lib/apt/lists/*

# 设置本地语言，避免一些 CLI 提示乱码
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# 安装 oh-my-zsh 为 node 用户
# 设置 root 和 node 用户的默认 shell 为 zsh
RUN chsh -s $(which zsh) root && chsh -s $(which zsh) node
# 为 node 用户安装 oh-my-zsh（手动安装方式，更可靠）
RUN mkdir -p /home/node/.oh-my-zsh && \
    git clone https://github.com/ohmyzsh/ohmyzsh.git /home/node/.oh-my-zsh && \
    cp /home/node/.oh-my-zsh/templates/zshrc.zsh-template /home/node/.zshrc && \
    sed -i 's/^ZSH_THEME=.*/ZSH_THEME="robbyrussell"/' /home/node/.zshrc && \
    chown -R node:node /home/node/.oh-my-zsh /home/node/.zshrc

# 安装 pnpm 和 yarn（可选）
RUN npm install -g eslint typescript nodemon

# 设置默认 shell
SHELL ["/usr/bin/zsh", "-c"]

# 设定默认工作目录
WORKDIR /workspace

# 容器启动时默认进入 /workspace
CMD ["zsh"]
