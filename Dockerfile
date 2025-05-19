FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    build-essential \
    wget \
    libtool \
    automake \
    pkg-config && \
    # Install TA-Lib
    wget https://downloads.sourceforge.net/project/ta-lib/ta-lib/0.4.0/ta-lib-0.4.0-src.tar.gz && \
    tar -xzf ta-lib-0.4.0-src.tar.gz && \
    cd ta-lib/ && \
    sed -i 's/TA_FuncHandle \*\*handle/const TA_FuncHandle \*\*handle/g' include/ta_abstract.h && \
    ./configure --prefix=/usr && \
    make && \
    make install && \
    cd .. && \
    rm -rf ta-lib ta-lib-0.4.0-src.tar.gz && \
    # Cleanup build tools
    apt-get remove -y build-essential wget && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy app
COPY . /app
WORKDIR /app
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]