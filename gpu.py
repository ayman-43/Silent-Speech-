# GPU + CPU + RAM + Disk + Network Monitor
# Works on Windows/Linux/macOS
# Install requirements:
# pip install psutil GPUtil pynvml

import time
import psutil
import GPUtil
from pynvml import *

# Initialize NVIDIA NVML
nvmlInit()

def bytes_to_gb(bytes_value):
    return round(bytes_value / (1024 ** 3), 2)

while True:
    print("\n" + "=" * 70)
    print("SYSTEM RESOURCE MONITOR")
    print("=" * 70)

    # ================= CPU =================
    cpu_usage = psutil.cpu_percent(interval=1)
    cpu_freq = psutil.cpu_freq()

    print(f"\nCPU Usage: {cpu_usage}%")

    if cpu_freq:
        print(f"CPU Frequency: {cpu_freq.current:.2f} MHz")

    # ================= RAM =================
    ram = psutil.virtual_memory()

    print("\nRAM:")
    print(f"Total RAM : {bytes_to_gb(ram.total)} GB")
    print(f"Used RAM  : {bytes_to_gb(ram.used)} GB")
    print(f"Free RAM  : {bytes_to_gb(ram.available)} GB")
    print(f"RAM Usage : {ram.percent}%")

    # ================= DISK =================
    disk = psutil.disk_usage('/')

    print("\nDisk:")
    print(f"Total Disk : {bytes_to_gb(disk.total)} GB")
    print(f"Used Disk  : {bytes_to_gb(disk.used)} GB")
    print(f"Free Disk  : {bytes_to_gb(disk.free)} GB")
    print(f"Disk Usage : {disk.percent}%")

    # ================= NETWORK =================
    network = psutil.net_io_counters()

    print("\nNetwork:")
    print(f"Upload   : {round(network.bytes_sent / (1024**2), 2)} MB")
    print(f"Download : {round(network.bytes_recv / (1024**2), 2)} MB")

    # ================= GPU =================
    gpus = GPUtil.getGPUs()

    if gpus:
        print("\nGPU INFO:")
        for i, gpu in enumerate(gpus):
            handle = nvmlDeviceGetHandleByIndex(i)

            temperature = nvmlDeviceGetTemperature(
                handle,
                NVML_TEMPERATURE_GPU
            )

            power_usage = nvmlDeviceGetPowerUsage(handle) / 1000

            print(f"\nGPU {i}: {gpu.name}")
            print(f"GPU Load       : {gpu.load * 100:.2f}%")
            print(f"GPU Memory Used: {gpu.memoryUsed} MB")
            print(f"GPU Memory Free: {gpu.memoryFree} MB")
            print(f"GPU Memory Total: {gpu.memoryTotal} MB")
            print(f"GPU Temp       : {temperature} °C")
            print(f"Power Usage    : {power_usage:.2f} W")
    else:
        print("\nNo GPU detected.")

    print("\nRefreshing in 2 seconds...")
    time.sleep(2)