from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import create_engine, Column, Integer, String, TIMESTAMP, ForeignKey, Text, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
import os
from dotenv import load_dotenv

load_dotenv()


"""
FastAPI application for Thought Box API.
Provides endpoints to manage boxes and thoughts stored in a SQLite database.
"""

app = FastAPI(swagger_ui_parameters={"syntaxHighlight": True})

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models
class Box(Base):
    __tablename__ = "boxes"
    box_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    thoughts = relationship("Thought", back_populates="box")

class Thought(Base):
    __tablename__ = "thoughts"
    id = Column(Integer, primary_key=True, index=True)
    box_id = Column(Integer, ForeignKey("boxes.box_id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    box = relationship("Box", back_populates="thoughts")

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
@app.get("/")
def read_root():
    """
    Root endpoint to check API status. \n
    Returns: \n
        dict: Status of the API.
    """
    return {"status": "running"}

@app.get("/boxes")
def get_boxes(db: Session = Depends(get_db)):
    """
    Retrieve all boxes from the database. \n
    Returns: \n
        dict: List of boxes with id, name, and creation timestamp.
    """
    boxes = db.query(Box).all()
    return {"boxes": [{"id": box.box_id, "name": box.name, "created_at": box.created_at} for box in boxes]}
@app.post("/add/box/{box_name}")
def create_box(box_name: str, db: Session = Depends(get_db)):
    """
    Create a new box with the given name. \n
    Args: \n
        box_name (str): Name of the box to create. \n
    Returns: \n
        dict: Success message.
    """
    if db.query(Box).filter(Box.name == box_name).first():
        raise HTTPException(status_code=400, detail="Box already exists.")
    
    new_box = Box(name=box_name)

    db.add(new_box)
    db.commit()
    db.refresh(new_box)
    return {"message": f"Box '{box_name}' created successfully!"}

@app.post("/add/thought/{box_id}")
def add_thought(box_id: int, thought: str, db: Session = Depends(get_db)):
    """
    Add a thought to a specific box. \n
    Args: \n
        box_id (int): ID of the box to add the thought to. \n
        thought (str): The thought text to add. \n
    Returns: \n
        dict: Success message.
    """
    box = db.query(Box).filter(Box.box_id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found.")
    new_thought = Thought(box_id=box_id, text=thought)

    db.add(new_thought)
    db.commit()
    db.refresh(new_thought)

    return {"message": f"Thought added to box with ID '{box_id}'."}
@app.get("/get/thoughts/{box_id}")
def get_thoughts(box_id: int, db: Session = Depends(get_db)):
    """
    Retrieve all thoughts for a specific box. \n
    Args: \n
        box_id (int): ID of the box to get thoughts from. \n
    Returns: \n
        dict: List of thoughts with id, text, and creation timestamp.
    """
    thoughts = db.query(Thought).filter(Thought.box_id == box_id).all()
    return {"thoughts": [{"id": t.id, "text": t.text, "created_at": t.created_at} for t in thoughts]}