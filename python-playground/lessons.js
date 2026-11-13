// Lessons for the Python Playground, in order.
//
// Each lesson has:
//   id       URL hash, e.g. /python-playground/#loops (the cheat sheet links here)
//   title    shown in the lesson list
//   intro    short explanation (HTML)
//   task     what to do (HTML)
//   starter  starter code (Reset restores this)
//   check    Python run after the user's code. It can use:
//              ns        the user's variables, e.g. ns["age"]
//              output    everything the code printed, as one string
//              lines     printed lines, trimmed
//              code      the user's code as text
//              run_with  re-run the code with a variable changed, e.g. run_with(score=95)
//            Each failed `assert` shows its message to the user as the hint.
window.LESSONS = [
    {
        id: "variables",
        title: "Variables and types",
        intro: `
            <p>A <strong>variable</strong> is a name that points to a value. You create one with <code>=</code>. Python works out the <strong>type</strong> from the value:</p>
            <ul>
                <li><code>str</code>: text in quotes, like <code>"Denver"</code></li>
                <li><code>int</code>: a whole number, like <code>42</code></li>
                <li><code>float</code>: a decimal number, like <code>1.75</code></li>
                <li><code>bool</code>: <code>True</code> or <code>False</code></li>
            </ul>
            <p><code>type(x)</code> tells you a value's type. An <strong>f-string</strong> puts variables inside text: <code>f"{city} in {year}"</code>.</p>`,
        task: `
            <p>Create four variables: <code>name</code> (a string), <code>age</code> (an int), <code>height</code> in meters (a float) and <code>is_student</code> (a bool).</p>
            <p>Then print a sentence that includes your name and age using an f-string.</p>`,
        starter: `# A variable is a name that points to a value
city = "Denver"
year = 2026
print(city, year)
print(type(city), type(year))

# f-strings put variables inside text
print(f"{city} in {year}")

# Your turn: create name, age, height and is_student below,
# then print a sentence with an f-string.

`,
        check: `
specs = [
    ("name", str, "a string (text in quotes), like \\"Ada\\""),
    ("age", int, "a whole number with no quotes, like 30"),
    ("height", float, "a decimal number, like 1.75"),
    ("is_student", bool, "True or False, with no quotes"),
]
for var, typ, desc in specs:
    assert var in ns, f"Create a variable called {var}."
    assert type(ns[var]) is typ, f"{var} should be {desc}. Right now it's a {type(ns[var]).__name__}."
assert str(ns["name"]) in output and str(ns["age"]) in output, \\
    'Print a sentence that includes name and age, e.g. print(f"{name} is {age} years old").'
`
    },
    {
        id: "conditionals",
        title: "Conditionals",
        intro: `
            <p><code>if</code> runs a block of code only when a condition is <code>True</code>. Add <code>elif</code> ("else if") for more conditions and <code>else</code> for everything left over. Python checks them top to bottom and runs the <em>first</em> match only.</p>
            <p>Comparisons: <code>==</code> equal, <code>!=</code> not equal, <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>, <code>&gt;=</code>. Combine them with <code>and</code>, <code>or</code> and <code>not</code>.</p>
            <p>The indented lines (4 spaces) after the colon <code>:</code> are the block that runs.</p>`,
        task: `
            <p>Set <code>grade</code> based on <code>score</code>: <code>"A"</code> for 90 and up, <code>"B"</code> for 80–89, <code>"C"</code> for 70–79, and <code>"F"</code> for anything lower. Then print <code>grade</code>.</p>
            <p>Keep the <code>score = 83</code> line. The checker tries other scores too.</p>`,
        starter: `temperature = 72

if temperature > 85:
    print("Hot")
elif temperature > 60:
    print("Nice out")
else:
    print("Bring a jacket")

# Your turn
score = 83

# Set grade to "A", "B", "C" or "F" here

`,
        check: `
assert "grade" in ns, "Create a variable called grade."
for s, want in [(95, "A"), (90, "A"), (89, "B"), (80, "B"), (79, "C"), (70, "C"), (69, "F"), (12, "F")]:
    got = run_with(score=s).get("grade")
    assert got == want, (
        f'With score = {s}, grade should be "{want}" but it was {got!r}. '
        "Check your >= comparisons and the order of your if/elif branches."
    )
assert str(ns["grade"]) in lines, "Print grade at the end: print(grade)"
`
    },
    {
        id: "loops",
        title: "Loops",
        intro: `
            <p>A <code>for</code> loop runs a block once for each item in a sequence. <code>range(1, 6)</code> gives the numbers 1, 2, 3, 4, 5 (it stops <em>before</em> the second number).</p>
            <p>A <code>while</code> loop repeats as long as its condition stays <code>True</code>. Make sure something changes inside it, or it will run forever.</p>
            <p>A common pattern is an <strong>accumulator</strong>: start at <code>total = 0</code> and add to it inside the loop with <code>total += n</code>.</p>`,
        task: `
            <p>Use a <code>for</code> loop to print the squares of 1 through 5, one per line: <code>1</code>, <code>4</code>, <code>9</code>, <code>16</code>, <code>25</code>. They should be the last five lines of your output.</p>
            <p>Also add them up in a variable called <code>total</code>. Don't print <code>total</code>; just store it.</p>`,
        starter: `# for loop over a range
for n in range(1, 4):
    print("n is", n)

# while loop with a counter
count = 3
while count > 0:
    print("countdown", count)
    count -= 1

# Your turn: print the squares of 1 through 5
# and store their sum in total.
total = 0

`,
        check: `
want = ["1", "4", "9", "16", "25"]
assert "for" in code, "Use a for loop, for example: for n in range(1, 6):"
last = lines[-5:]
assert last == want, (
    "The last five lines should be 1, 4, 9, 16, 25, one per line. "
    f"Yours were: {', '.join(last) if last else 'nothing'}. "
    "Try range(1, 6) and print(n * n)."
)
assert "total" in ns, "Create a variable called total."
assert ns["total"] == 55, f"total should be 55 (1 + 4 + 9 + 16 + 25) but it's {ns['total']!r}. Add each square with total += ..."
`
    },
    {
        id: "lists-dicts",
        title: "Lists and dictionaries",
        intro: `
            <p>A <strong>list</strong> holds items in order: <code>colors = ["red", "green"]</code>. Get items by position starting at 0 (<code>colors[0]</code>), add with <code>.append()</code>, and count with <code>len()</code>.</p>
            <p>A <strong>dictionary</strong> maps keys to values: <code>ages = {"Ada": 36}</code>. Look up with <code>ages["Ada"]</code>, and add or change with <code>ages["Bo"] = 25</code>.</p>
            <p>You can loop over both: <code>for color in colors:</code> and <code>for name, age in ages.items():</code>.</p>`,
        task: `
            <p>Using <code>prices</code> and <code>cart</code> below:</p>
            <ol>
                <li>Append <code>"milk"</code> to <code>cart</code>.</li>
                <li>Add <code>"eggs"</code> to <code>prices</code> with a price of <code>3.49</code>.</li>
                <li>Loop over <code>cart</code> and add up the price of every item into <code>total</code>.</li>
                <li>Print <code>total</code> rounded to 2 decimals: <code>print(round(total, 2))</code>.</li>
            </ol>`,
        starter: `# Lists keep items in order
colors = ["red", "green", "blue"]
colors.append("yellow")
print(colors[0], len(colors))

# Dictionaries map keys to values
ages = {"Ada": 36, "Grace": 45}
ages["Bo"] = 25
print(ages["Grace"])

# Your turn
prices = {"apple": 0.5, "bread": 2.25, "milk": 1.99}
cart = ["apple", "apple", "bread"]

`,
        check: `
assert ns.get("cart") == ["apple", "apple", "bread", "milk"], \\
    f'cart should be ["apple", "apple", "bread", "milk"] but it is {ns.get("cart")!r}. Use cart.append("milk").'
assert isinstance(ns.get("prices"), dict) and ns["prices"].get("eggs") == 3.49, \\
    'Add eggs to prices with prices["eggs"] = 3.49'
assert "total" in ns, "Create a variable called total that adds up the cart."
assert isinstance(ns["total"], (int, float)) and abs(ns["total"] - 5.24) < 0.001, \\
    f"total should be 5.24 (0.5 + 0.5 + 2.25 + 1.99) but it's {ns['total']!r}. Start with total = 0, then total += prices[item] inside the loop."
assert "5.24" in output, "Print the total, e.g. print(round(total, 2))."
`
    },
    {
        id: "functions",
        title: "Functions",
        intro: `
            <p>A <strong>function</strong> is a reusable, named block of code. Define it with <code>def</code>, list its <strong>parameters</strong> in parentheses, and send a result back with <code>return</code>.</p>
            <p>A parameter can have a <strong>default value</strong>: <code>def greet(name, greeting="Hello")</code> lets you call <code>greet("Ada")</code> or <code>greet("Ada", "Hi")</code>.</p>
            <p><code>return</code> is different from <code>print</code>: return hands a value back so you can store it or use it again, while print only shows it.</p>`,
        task: `
            <p>Write two functions:</p>
            <ol>
                <li><code>greet(name, greeting="Hello")</code> that <em>returns</em> a string like <code>"Hello, Ada!"</code></li>
                <li><code>average(numbers)</code> that <em>returns</em> the average of a list of numbers. Hint: <code>sum()</code> and <code>len()</code>.</li>
            </ol>`,
        starter: `def square(n):
    return n * n

result = square(4)
print(result)          # 16
print(square(3) + 1)   # 10

# Your turn: write greet and average below

`,
        check: `
for fname in ("greet", "average"):
    assert callable(ns.get(fname)), f"Define a function called {fname} with def {fname}(...):"
g = ns["greet"]
r = g("Ada")
assert r is not None, "greet should return the string, not print it. Use return f\\"{greeting}, {name}!\\""
assert r == "Hello, Ada!", f'greet("Ada") should return "Hello, Ada!" but returned {r!r}.'
r = g("Bo", "Hi")
assert r == "Hi, Bo!", f'greet("Bo", "Hi") should return "Hi, Bo!" but returned {r!r}. Use the greeting parameter.'
a = ns["average"]
r = a([1, 2, 3, 4])
assert r is not None, "average should return the result, not print it."
assert r == 2.5, f"average([1, 2, 3, 4]) should return 2.5 but returned {r!r}. Try sum(numbers) / len(numbers)."
assert a([10]) == 10, "average([10]) should return 10."
`
    }
];
