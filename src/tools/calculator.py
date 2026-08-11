import ast
import operator
import logging
from langchain_core.tools import tool

logger = logging.getLogger("agent")

# Safe operators for calculator
OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg
}

def safe_eval(node):
    if isinstance(node, ast.Constant):  # <number>
        return node.value
    elif isinstance(node, ast.BinOp):  # <left> <operator> <right>
        return OPERATORS[type(node.op)](safe_eval(node.left), safe_eval(node.right))
    elif isinstance(node, ast.UnaryOp):  # <operator> <operand> e.g., -1
        return OPERATORS[type(node.op)](safe_eval(node.operand))
    else:
        raise TypeError(node)

@tool
def calculator(expression: str) -> str:
    """Evaluates mathematical expressions. Use this to calculate numbers.
    Examples: '25 * 48', '100 / 4', '2 ** 10'. 
    Only basic math operations are supported (+, -, *, /, **).
    """
    logger.info(f"[TOOL] Arguments: {expression}")
    try:
        # safely parse the expression
        node = ast.parse(expression, mode='eval').body
        result = safe_eval(node)
        logger.info(f"[TOOL] Result: {result}")
        return str(result)
    except ZeroDivisionError:
        logger.error("[TOOL] Error: Division by zero")
        return "Error: Division by zero is not allowed."
    except Exception as e:
        logger.error(f"[TOOL] Error evaluating expression: {e}")
        return "I couldn't complete that calculation because the expression is invalid."
