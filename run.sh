#! /bin/bash

while true; do DEBUG=adb:* sudo ./bin/stf local --public-ip="stf.zipt.design" && break; done
