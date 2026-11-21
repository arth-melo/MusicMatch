import os
import re
import threading

import requests
from dotenv import load_dotenv
load_dotenv()
from flask import Flask, jsonify, render_template, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

import repositorio
from repositorio import EmailJaCadastrado