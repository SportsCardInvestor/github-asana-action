const action = require('./action');
const core = require('@actions/core');
const github = require('@actions/github');

describe('asana github actions', () => {
  let inputs = {};
  let defaultBody;
  let multiLineBody;
  let client;
  let task;

  const asanaPAT = process.env['ASANA_PAT'];
  if(!asanaPAT) {
    throw new Error('need ASANA_PAT in the test env');
  }
  const projectId = process.env['ASANA_PROJECT_ID'];
  if(!projectId) {
    throw new Error('need ASANA_PROJECT_ID in the test env');
  }

  const commentId = Date.now().toString();

  beforeAll(async () => {
      // Mock getInput
      jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
        if(inputs[name] === undefined && options && options.required){
          throw new Error(name + " was not expected to be empty");
        }
        return inputs[name]
      })
  
      // Mock error/warning/info/debug
      jest.spyOn(core, 'error').mockImplementation(jest.fn())
      jest.spyOn(core, 'warning').mockImplementation(jest.fn())
      jest.spyOn(core, 'info').mockImplementation(jest.fn())
      jest.spyOn(core, 'debug').mockImplementation(jest.fn())
  
      github.context.ref = 'refs/heads/some-ref'
      github.context.sha = '1234567890123456789012345678901234567890'
  
      process.env['GITHUB_REPOSITORY'] = 'sportscardinvestor/some-sick-repo-brah'

      client = await action.buildClient(asanaPAT);
      if(client === null){
        throw new Error('client authorization failed');
      }

      task = await client.tasks.create({
        'name': 'my fantastic task',
        'notes': 'generated automatically by the test suite',
        'projects': [projectId]
      });

      defaultBody = `Implement https://app.asana.com/0/${projectId}/${task.gid} in record time`;
      multiLineBody = `
        Foo bar baz quux
        .asklfa;sldkfj
        Asana Task: https://app.asana.com/0/${projectId}/${task.gid}
        asdflkjasd;ljf
      `;
    })

    afterAll(async () => {
      await client.tasks.delete(task);
    })
  
    beforeEach(() => {
      // Reset inputs
      inputs = {}
      github.context.payload = {};
    })

    test('getting Asana task IDs from a PR body', () => {
      let taskIDs = action.getTaskIDsFromPRBody(`
        Foo bar https://app.asana.com/0/1202227011896787/1202716380711303
        asdfasdfasdf
        asfdkhsjf https://app.asana.com/0/1202227011896787/1202716380711310/f
      `);

      expect(taskIDs).toStrictEqual(["1202716380711303", "1202716380711310"]);

      taskIDs = action.getTaskIDsFromPRBody(`
      https://app.asana.com/0/1202454337132640/1202824585057615/f
      https://app.asana.com/0/1202454337132640/1202824585057613/f
      https://app.asana.com/0/1202454337132640/1202824585057581/f
      https://app.asana.com/0/1202454337132640/1202824585057575/f
      `);

      expect(taskIDs).toStrictEqual(["1202824585057615", "1202824585057613", "1202824585057581", "1202824585057575"]);
    });

    test('asserting a links presence', async () => {
      inputs = {
        'asana-pat': asanaPAT,
        'action': 'assert-link',
        'link-required': 'true',
        'github-token': 'fake'
      }
      github.context.payload = {
        pull_request: {
          'body': defaultBody,
          'head': {
            'sha': '1234567890123456789012345678901234567890'
          }
        }
      };

      const mockCreateStatus = jest.fn()
      github.GitHub = jest.fn().mockImplementation(() => {
        return {
          repos: {
            createStatus: mockCreateStatus,
          }
        }
      });

      await action.action();

      expect(mockCreateStatus).toHaveBeenCalledWith({
        owner: 'sportscardinvestor',
        repo: 'some-sick-repo-brah',
        context: 'asana-link-presence',
        state: 'success',
        description: 'asana link not found',
        sha: '1234567890123456789012345678901234567890',
      });
    });

    test('asserting a links presence, multiline', async () => {
      inputs = {
        'asana-pat': asanaPAT,
        'action': 'assert-link',
        'link-required': 'true',
        'github-token': 'fake'
      }
      github.context.payload = {
        pull_request: {
          'body': multiLineBody,
          'head': {
            'sha': '1234567890123456789012345678901234567890'
          }
        }
      };

      const mockCreateStatus = jest.fn()
      github.GitHub = jest.fn().mockImplementation(() => {
        return {
          repos: {
            createStatus: mockCreateStatus,
          }
        }
      });

      await action.action();

      expect(mockCreateStatus).toHaveBeenCalledWith({
        owner: 'sportscardinvestor',
        repo: 'some-sick-repo-brah',
        context: 'asana-link-presence',
        state: 'success',
        description: 'asana link not found',
        sha: '1234567890123456789012345678901234567890',
      });
    });

    test('creating a comment', async () => {
      inputs = {
        'asana-pat': asanaPAT,
        'action': 'add-comment',
        'comment-id': commentId,
        'text': 'rad stuff',
        'is-pinned': 'true'
      }
      // Mock github context
      github.context.payload = {
        pull_request: {
          'body': defaultBody
        }
      };

      await expect(action.action()).resolves.toHaveLength(1);

      // rerunning with the same comment-Id should not create a new comment
      await expect(action.action()).resolves.toHaveLength(0);
    });

    test('removing a comment', async () => {
      inputs = {
        'asana-pat': asanaPAT,
        'action': 'remove-comment',
        // note: relies on the task being created in `creating a comment` test
        'comment-id': commentId,
      }
      github.context.payload = {
        pull_request: {
          'body': defaultBody
        }
      };

      await expect(action.action()).resolves.toHaveLength(1);
    });

    test('moving sections', async () => {
      inputs = {
        'asana-pat': asanaPAT,
        'action': 'move-section',
        'targets': '[{"project": "Asana bot test environment", "section": "Done"}]'
      }
      github.context.payload = {
        pull_request: {
          'body': defaultBody
        }
      };

      await expect(action.action()).resolves.toHaveLength(1);

      inputs = {
        'asana-pat': asanaPAT,
        'action': 'move-section',
        'targets': '[{"project": "Asana bot test environment", "section": "New"}]'
      }

      await expect(action.action()).resolves.toHaveLength(1);
    });

    test('completing task', async () => {
      inputs = {
        'asana-pat': asanaPAT,
        'action': 'complete-task',
        'is-complete': 'true'
      }
      github.context.payload = {
        pull_request: {
          'body': defaultBody
        }
      };

      await expect(action.action()).resolves.toHaveLength(1);
      const actualTask = await client.tasks.findById(task.gid);
      expect(actualTask.completed).toBe(true);
    });
});