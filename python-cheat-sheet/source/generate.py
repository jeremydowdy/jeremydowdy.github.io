"""Generates ../index.html (the Python Cheat Sheet) from the examples below.

Usage, from this folder:
    python3 generate.py test                                # run every runnable example with real Python
    python3 generate.py build template.html > ../index.html  # rebuild the page

Edit the sec(...) calls to change content, then run both commands.
Only the Python standard library is needed.
"""
import html, sys, subprocess, textwrap

# (id, title, lesson_id or None, intro_html, [(caption, code, runnable)], extra_html)
S = []
def sec(id, title, lesson, intro, blocks, extra=""):
    S.append((id, title, lesson, intro, blocks, extra))

sec("variables", "Variables, types and basic operators", ("variables", "Lesson 1, Variables and types"),
 "<p>A variable is a name for a value. Python figures out the type from the value, and <code>type()</code> tells you what it is.</p>",
 [("Creating variables", '''name = "Ada"        # str (text)
age = 36            # int (whole number)
height = 1.68       # float (decimal)
is_admin = False    # bool (True or False)
nothing = None      # "no value"

print(type(age))    # <class 'int'>''', True),
  ("Math operators", '''print(7 + 2)    # 9   add
print(7 - 2)    # 5   subtract
print(7 * 2)    # 14  multiply
print(7 / 2)    # 3.5 divide (always a float)
print(7 // 2)   # 3   whole-number divide
print(7 % 2)    # 1   remainder
print(7 ** 2)   # 49  power''', True),
  ("Updating and converting", '''score = 10
score += 5          # same as score = score + 5
print(score)        # 15

print(int("42") + 1)    # 43   text to int
print(float("2.5"))     # 2.5  text to float
print(str(99) + "!")    # 99!  number to text''', True),
  ("Comparisons give True or False", '''print(5 == 5)       # True   equal
print(5 != 3)       # True   not equal
print(3 < 5 <= 5)   # True   chained
print(True and False, True or False, not True)  # False True False''', True)])

sec("strings", "Strings", ("variables", "f-strings in Lesson 1, Variables and types"),
 "<p>Strings are text in single or double quotes. They can't be changed in place; methods return a new string.</p>",
 [("f-strings", '''name = "Ada"
price = 3.5
print(f"Hi, {name}!")            # Hi, Ada!
print(f"Total: ${price:.2f}")    # Total: $3.50
print(f"{name} has {len(name)} letters")''', True),
  ("Common methods", '''s = "  Hello, World  "
print(s.strip())                 # "Hello, World"
print(s.lower(), s.upper())
print(s.replace("World", "Python"))
print("a,b,c".split(","))        # ['a', 'b', 'c']
print("-".join(["a", "b", "c"]))  # a-b-c
print("Hello".startswith("He"))  # True
print("ell" in "Hello")          # True''', True),
  ("Indexing and slicing", '''word = "Python"
print(word[0])      # P   (first; positions start at 0)
print(word[-1])     # n   (last)
print(word[0:2])    # Py  (start up to, not including, end)
print(word[2:])     # thon
print(word[::-1])   # nohtyP (reversed)''', True)])

sec("collections", "Lists, tuples, dictionaries and sets", ("lists-dicts", "Lesson 4, Lists and dictionaries"),
 "<p>Four built-in ways to group values. Lists are the everyday choice; use a dictionary when you look things up by name.</p>",
 [("Lists: ordered, changeable", '''nums = [3, 1, 2]
nums.append(4)          # [3, 1, 2, 4]
nums.insert(0, 9)       # [9, 3, 1, 2, 4]
nums.remove(9)          # removes the first 9
last = nums.pop()       # removes and returns 4
nums.sort()             # [1, 2, 3]
print(nums, len(nums), nums[0], nums[-1])
print(nums[1:])         # slicing works like strings: [2, 3]''', True),
  ("Tuples: ordered, can't change", '''point = (3, 4)
x, y = point            # unpacking
print(x, y)             # 3 4''', True),
  ("Dictionaries: key → value", '''ages = {"Ada": 36, "Grace": 45}
ages["Bo"] = 25             # add or update
print(ages["Ada"])          # 36
print(ages.get("Zed", 0))   # 0  (default instead of an error)
del ages["Grace"]
for name, age in ages.items():
    print(name, age)
print("Ada" in ages)        # True (checks keys)''', True),
  ("Sets: unique items, no order", '''tags = {"python", "web", "python"}
print(tags)                 # {'python', 'web'} (duplicates removed)
tags.add("data")
print({1, 2, 3} & {2, 3, 4})   # {2, 3}  in both
print({1, 2} | {2, 3})         # {1, 2, 3} in either''', True)])

sec("conditionals", "Conditionals: if, elif, else", ("conditionals", "Lesson 2, Conditionals"),
 "<p>Python checks each condition from top to bottom and runs only the first block that matches. Indent the block with 4 spaces.</p>",
 [("if / elif / else", '''temp = 72
if temp > 85:
    print("Hot")
elif temp > 60:
    print("Nice")       # this one runs
else:
    print("Cold")''', True),
  ("Combining conditions", '''age = 20
has_ticket = True
if age >= 18 and has_ticket:
    print("Come in")
if not has_ticket or age < 18:
    print("Sorry")''', True),
  ("Truthy and falsy", '''items = []
if not items:           # empty list, "", 0 and None count as False
    print("Nothing here")''', True),
  ("One-line if (conditional expression)", '''score = 83
result = "pass" if score >= 70 else "fail"
print(result)''', True)])

sec("loops", "Loops: for, while, range, enumerate", ("loops", "Lesson 3, Loops"),
 "<p>Use <code>for</code> to go through each item in something, and <code>while</code> to repeat until a condition becomes false.</p>",
 [("for and range", '''for n in range(3):          # 0, 1, 2
    print(n)
for n in range(1, 10, 2):   # 1, 3, 5, 7, 9 (start, stop, step)
    print(n)
for letter in "hi":         # works on strings, lists, dicts...
    print(letter)''', True),
  ("enumerate: position and item", '''colors = ["red", "green"]
for i, color in enumerate(colors):
    print(i, color)         # 0 red, then 1 green''', True),
  ("while", '''count = 3
while count > 0:
    print(count)
    count -= 1              # without this, the loop never ends
print("Liftoff!")''', True),
  ("break, continue and accumulating", '''total = 0
for n in range(10):
    if n == 5:
        break               # stop the loop
    if n % 2 == 0:
        continue            # skip to the next n
    total += n
print(total)                # 1 + 3 = 4''', True),
  ("List comprehension (a shortcut loop)", '''squares = [n * n for n in range(1, 6)]
print(squares)              # [1, 4, 9, 16, 25]''', True)])

sec("functions", "Functions: def, arguments, return", ("functions", "Lesson 5, Functions"),
 "<p>Functions package code under a name so you can reuse it. <code>return</code> sends a value back; without it a function returns <code>None</code>.</p>",
 [("Defining and calling", '''def add(a, b):
    return a + b

result = add(2, 3)
print(result)               # 5''', True),
  ("Default and keyword arguments", '''def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

print(greet("Ada"))                  # Hello, Ada!
print(greet("Bo", "Hi"))             # Hi, Bo!
print(greet(greeting="Hey", name="Cy"))''', True),
  ("Returning several values", '''def min_max(numbers):
    return min(numbers), max(numbers)

low, high = min_max([4, 1, 9])
print(low, high)            # 1 9''', True),
  ("return vs print", '''def shout(word):
    print(word.upper())     # shows it, but returns None

x = shout("hi")             # prints HI
print(x)                    # None''', True)])

sec("builtins", "Common built-in functions", None,
 "<p>These are always available, no import needed.</p>",
 [("The essentials", '''print("a", "b", sep="-")     # a-b
print(len([1, 2, 3]))        # 3
print(type(3.0))             # <class 'float'>
print(sorted([3, 1, 2]))     # [1, 2, 3]  (new list)
print(sorted(["b", "a"], reverse=True))
print(sum([1, 2, 3]))        # 6
print(min(4, 2, 8), max([4, 2, 8]))   # 2 8
print(round(3.14159, 2))     # 3.14
print(abs(-5))               # 5''', True),
  ("input: reading what the user types", '''name = input("What's your name? ")   # always returns a string
age = int(input("Age? "))            # convert to use it as a number
print(f"Hi {name}, next year you'll be {age + 1}")''', False)],
 '<p class="note"><code>input()</code> works in a normal Python install. In the playground, set a variable instead, like <code>name = "Ada"</code>.</p>')

sec("errors", "Reading errors", None,
 "<p>When something goes wrong, Python prints a <strong>traceback</strong>. Read it from the <strong>bottom up</strong>: the last line says what kind of error happened and why, and the lines above show where (file and line number).</p>",
 [("What a traceback looks like", '''Traceback (most recent call last):
  File "main.py", line 2, in <module>
    print(nmae)
          ^^^^
NameError: name 'nmae' is not defined''', False),
  ("NameError: a name Python doesn't know", '''name = "Ada"
print(nmae)        # typo, or the variable was never created
# Fix: check spelling, and create variables before using them''', False),
  ("TypeError: mixing types that don't fit", '''age = 36
print("Age: " + age)     # can't add str and int
# Fix: print("Age: " + str(age))  or  print(f"Age: {age}")''', False),
  ("IndexError: position past the end", '''colors = ["red", "green"]
print(colors[2])         # only positions 0 and 1 exist
# Fix: remember positions start at 0; check len(colors)''', False),
  ("Others you'll meet", '''# KeyError          dictionary key doesn't exist  -> use d.get(key)
# ValueError        right type, bad value: int("abc")
# ZeroDivisionError dividing by zero
# SyntaxError       Python can't read the code: missing : ( ) or quote
# IndentationError  the spaces at the start of a line don't line up
# AttributeError    that type has no such method: [1, 2].upper()''', False)])

def lesson_link(lesson):
    if not lesson: return ""
    lid, label = lesson
    return f'<p class="practice"><a href="../python-playground/#{lid}">Practice {html.escape(label)} →</a></p>'

def block(caption, code):
    return (f'<figure class="code-block">\n'
            f'<figcaption>{html.escape(caption)}</figcaption>\n'
            f'<pre><code>{html.escape(code)}</code></pre>\n'
            f'</figure>')

if sys.argv[1] == "test":
    for (id, title, lesson, intro, blocks, extra) in S:
        for cap, code, runnable in blocks:
            if not runnable: continue
            r = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True)
            status = "ok" if r.returncode == 0 else "FAIL"
            print(status, id, "|", cap, "" if r.returncode == 0 else r.stderr[-300:])
    sys.exit()

toc = "\n".join(f'                <li><a href="#{id}">{html.escape(title)}</a></li>' for (id, title, *_ ) in S)
toc += '\n                <li><a href="#next">Where to go next</a></li>'
body = []
for (id, title, lesson, intro, blocks, extra) in S:
    body.append(f'''        <section class="panel cs-section" id="{id}" aria-labelledby="{id}-h">
            <h2 id="{id}-h">{html.escape(title)}</h2>
            {intro}
            <div class="blocks">
{chr(10).join(block(c, code) for c, code, _ in blocks)}
            </div>
            {extra}
            {lesson_link(lesson)}
            <p class="to-top"><a href="#toc">↑ Back to contents</a></p>
        </section>''')
out = open(sys.argv[2]).read().replace("<!--TOC-->", toc).replace("<!--SECTIONS-->", "\n\n".join(body))
sys.stdout.write(out)
